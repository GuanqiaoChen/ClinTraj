"""Authorized local MIMIC-IV CSV adapter. No downloads or synthetic MIMIC records."""
import csv
import gzip
from collections import defaultdict
from datetime import datetime
from itertools import islice
from pathlib import Path

from pydantic import model_validator

from clintraj.domain.schemas import StrictModel

from .db import HistoricalCase, db_session
from .ingest import digest, put_source


class MimicObservation(StrictModel):
    admission_ref: str
    item_id: str
    observed_at: datetime
    available_at: datetime
    value: str
    unit: str = ""
    release_basis: str = "storetime"

    @model_validator(mode="after")
    def release_order(self):
        if self.available_at < self.observed_at:
            raise ValueError("MIMIC observation is released before it was observed")
        return self


class MimicAdmission(StrictModel):
    admission_ref: str
    admitted_at: datetime
    admission_type: str
    observations: tuple[MimicObservation, ...] = ()
    limitations: tuple[str, ...] = ("Retrospective historical record, not a current patient session.",)


def csv_rows(root: Path, name: str):
    path = next((p for p in (root / "hosp" / f"{name}.csv.gz", root / "hosp" / f"{name}.csv",
        root / f"{name}.csv.gz", root / f"{name}.csv") if p.is_file()), None)
    if path is None:
        raise ValueError(f"Local MIMIC-IV {name}.csv[.gz] is missing")
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8", newline="") as stream:
        yield from csv.DictReader(stream)


def read_mimic(root: Path, *, offset: int = 0, max_admissions: int = 1000):
    if offset < 0 or max_admissions < 1:
        raise ValueError("MIMIC batch offset/size must be nonnegative/positive")
    admissions = {}
    for row in islice(csv_rows(root, "admissions"), offset, offset + max_admissions):
        if not {"hadm_id", "admittime", "admission_type"} <= row.keys():
            raise ValueError("Invalid MIMIC admissions schema")
        admissions[row["hadm_id"]] = MimicAdmission(admission_ref=digest(row["hadm_id"]),
            admitted_at=datetime.fromisoformat(row["admittime"]), admission_type=row["admission_type"])
    observations = defaultdict(list)
    for row in csv_rows(root, "labevents"):
        if not {"hadm_id", "itemid", "charttime", "storetime", "value", "valueuom"} <= row.keys():
            raise ValueError("Invalid MIMIC labevents schema")
        if row["hadm_id"] not in admissions or not row["charttime"] or not row["storetime"]:
            continue  # Unknown release time must never be replaced with collection time.
        observed, available = datetime.fromisoformat(row["charttime"]), datetime.fromisoformat(row["storetime"])
        if available < observed:
            continue
        observations[row["hadm_id"]].append(MimicObservation(admission_ref=digest(row["hadm_id"]),
            item_id=row["itemid"], observed_at=observed, available_at=available,
            value=row["value"], unit=row["valueuom"]))
    for raw_id, admission in admissions.items():
        yield admission.model_copy(update={"observations": tuple(sorted(observations[raw_id], key=lambda o: o.available_at))})


def ingest_mimic(path: Path, version: str, *, offset: int = 0, max_admissions: int = 1000):
    records = list(read_mimic(path, offset=offset, max_admissions=max_admissions))
    chunks = []
    manifest = []
    for admission in records:
        manifest.append(digest(admission.model_dump_json()))
        for index, obs in enumerate(admission.observations):
            chunks.append({"key": f"{admission.admission_ref}:{index}", "document_id": admission.admission_ref,
                "text": f"MIMIC admission {admission.admission_type}. Laboratory item {obs.item_id}: {obs.value} {obs.unit}.",
                "concept_ids": ["MIMIC:itemid:" + obs.item_id],
                "metadata": {"kind": "historical_case", "review_status": "not_clinician_reviewed",
                    "observed_at": obs.observed_at.isoformat(), "available_at": obs.available_at.isoformat(),
                    "release_basis": obs.release_basis}})
    sid = put_source(name="Private MIMIC-IV", corpus="private_mimic", version=version,
        citation="https://physionet.org/content/mimiciv/", license="PhysioNet credentialed data use agreement; local authorized import",
        raw="\n".join(manifest).encode(), chunks=chunks,
        metadata={"admissions": len(records), "offset": offset, "max_admissions": max_admissions,
                  "missing_storetime": "excluded", "authorization": "operator acknowledged DUA"})
    with db_session() as db:
        for record in records:
            db.merge(HistoricalCase(id="mimic:" + version + ":" + record.admission_ref,
                source_id=sid, graph={"kind": "MIMIC observations", **record.model_dump(mode="json")},
                review_status="not_clinician_reviewed", is_synthetic=False))
        db.commit()
