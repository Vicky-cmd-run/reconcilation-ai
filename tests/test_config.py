"""
Tests for configuration management.
"""
import pytest
import os
from pydantic import ValidationError

from config import Settings, get_settings


class TestSettings:
    """Tests for Settings class."""

    def test_default_values(self):
        """Test that default values are correct."""
        settings = Settings()

        assert settings.APP_NAME == "FMCG Reconciliation AI"
        assert settings.APP_VERSION == "1.0.0"
        assert settings.DEBUG is False
        assert settings.API_PORT == 8000
        assert settings.MAX_FILE_SIZE_MB == 10
        assert settings.LLM_CACHE_ENABLED is True

    def test_port_validation(self):
        """Test port validation."""
        # Valid port
        settings = Settings(API_PORT=8080)
        assert settings.API_PORT == 8080

        # Invalid port - too low
        with pytest.raises(ValidationError):
            Settings(API_PORT=0)

        # Invalid port - too high
        with pytest.raises(ValidationError):
            Settings(API_PORT=70000)

    def test_file_size_validation(self):
        """Test file size validation."""
        # Valid file size
        settings = Settings(MAX_FILE_SIZE_MB=50)
        assert settings.MAX_FILE_SIZE_MB == 50

        # Invalid file size - too low
        with pytest.raises(ValidationError):
            Settings(MAX_FILE_SIZE_MB=0)

        # Invalid file size - too high
        with pytest.raises(ValidationError):
            Settings(MAX_FILE_SIZE_MB=150)

    def test_allowed_origins_parsing(self):
        """Test allowed origins parsing."""
        settings = Settings(
            ALLOWED_ORIGINS="http://localhost:3000, http://localhost:5173"
        )

        assert len(settings.allowed_origins_list) == 2
        assert "http://localhost:3000" in settings.allowed_origins_list
        assert "http://localhost:5173" in settings.allowed_origins_list

    def test_max_file_size_bytes(self):
        """Test max file size bytes calculation."""
        settings = Settings(MAX_FILE_SIZE_MB=10)
        assert settings.max_file_size_bytes == 10 * 1024 * 1024

    def test_api_key_configured(self):
        """Test API key configuration check."""
        # No key
        settings = Settings(GEMINI_API_KEY=None)
        assert settings.is_api_key_configured() is False

        # Empty key
        settings = Settings(GEMINI_API_KEY="")
        assert settings.is_api_key_configured() is False

        # Valid key
        settings = Settings(GEMINI_API_KEY="test-key")
        assert settings.is_api_key_configured() is True

    def test_temperature_validation(self):
        """Test temperature validation."""
        # Valid temperatures
        settings = Settings(LLM_TEMPERATURE=0.5)
        assert settings.LLM_TEMPERATURE == 0.5

        # Invalid - too low
        with pytest.raises(ValidationError):
            Settings(LLM_TEMPERATURE=-0.1)

        # Invalid - too high
        with pytest.raises(ValidationError):
            Settings(LLM_TEMPERATURE=1.1)


class TestGetSettings:
    """Tests for get_settings function."""

    def test_settings_cached(self):
        """Test that settings are cached."""
        settings1 = get_settings()
        settings2 = get_settings()

        assert settings1 is settings2

    def test_settings_from_env(self, monkeypatch):
        """Test settings loaded from environment."""
        monkeypatch.setenv('APP_NAME', 'Test App')
        monkeypatch.setenv('DEBUG', 'true')
        monkeypatch.setenv('API_PORT', '9000')

        # Clear cache
        get_settings.cache_clear()

        settings = get_settings()
        assert settings.APP_NAME == 'Test App'
        assert settings.DEBUG is True
        assert settings.API_PORT == 9000
