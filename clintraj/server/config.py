from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)
    database_url: str = "postgresql+psycopg://clintraj:clintraj_local@localhost:55432/clintraj"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: SecretStr = SecretStr("clintraj_local")
    model_provider: str = "local"
    local_model_url: str = "http://localhost:11434/v1"
    local_model_name: str = "qwen2.5:3b"
    local_model_api_key: SecretStr = SecretStr("")
    deepseek_api_key: SecretStr = SecretStr("")
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"
    allow_external_clinical_data: bool = False
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_cache: str = "outputs/models"
    embedding_threads: int = Field(default=4, ge=1)
    model_timeout: float = Field(default=180, ge=1)
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    source_workbook: str = "医生审核版.xlsx"

    @property
    def checkpoint_url(self) -> str:
        return self.database_url.replace("postgresql+psycopg://", "postgresql://")


@lru_cache
def settings() -> Settings:
    return Settings()
