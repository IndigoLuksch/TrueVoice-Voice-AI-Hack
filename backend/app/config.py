from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    speechmatics_api_key: SecretStr
    thymia_api_key: SecretStr
    anthropic_api_key: SecretStr
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_csv(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v


def mask_key(value: str) -> str:
    """Return a short, non-reversible identifier for a secret.

    Shows the first 3 characters and the length, e.g. "sm-ab****(len=20)".
    Safe to log. Never log raw secret values.
    """
    if not value:
        return "<empty>"
    head = value[:3]
    return f"{head}****(len={len(value)})"


def log_key_presence(settings: "Settings") -> dict[str, str]:
    """Return a dict of {env_var: masked_value} for startup logging."""
    return {
        "SPEECHMATICS_API_KEY": mask_key(settings.speechmatics_api_key.get_secret_value()),
        "THYMIA_API_KEY": mask_key(settings.thymia_api_key.get_secret_value()),
        "ANTHROPIC_API_KEY": mask_key(settings.anthropic_api_key.get_secret_value()),
    }


settings = Settings()
