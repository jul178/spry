import json
from typing import Any
import jwt
from jwt import PyJWKSet
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any] | None:
    """Verifies Cognito JWT access/id token against the user pool's JWKS.

    If auth is not configured, returns None to allow development / unauthenticated access.
    If auth is configured, requires a valid, unexpired token matching issuer and client_id.
    """
    if not settings.auth_configured:
        return None

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        if settings.cognito_jwks:
            jwks_dict = json.loads(settings.cognito_jwks)
            jwk_set = PyJWKSet.from_dict(jwks_dict)
            unverified_header = jwt.get_unverified_header(token)
            key = jwk_set[unverified_header["kid"]]
            signing_key = key.key
        else:
            jwk_client = jwt.PyJWKClient(f"{settings.cognito_issuer}/.well-known/jwks.json")
            signing_key = jwk_client.get_signing_key_from_jwt(token).key

        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            issuer=settings.cognito_issuer,
            options={"verify_exp": True, "verify_iss": True},
        )

        token_client_id = payload.get("client_id") or payload.get("aud")
        if token_client_id != settings.cognito_client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token client_id does not match",
            )
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
