import { AuthProviderNoUserManagerProps } from "react-oidc-context";

export const COGNITO_REGION =
  process.env.NEXT_PUBLIC_COGNITO_REGION || "us-east-1";
export const COGNITO_USER_POOL_ID =
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "";
export const COGNITO_CLIENT_ID =
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "";
export const COGNITO_DOMAIN =
  process.env.NEXT_PUBLIC_COGNITO_DOMAIN || "";
export const COGNITO_GOOGLE_ENABLED =
  process.env.NEXT_PUBLIC_COGNITO_GOOGLE_ENABLED === "true";

export function isAuthEnabled(): boolean {
  return Boolean(COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID);
}

export function getCallbackUri(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback/`;
  }
  return "http://localhost:3000/auth/callback/";
}

export function getLogoutUri(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/`;
  }
  return "http://localhost:3000/";
}

export const oidcConfig: AuthProviderNoUserManagerProps = {
  authority: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
  client_id: COGNITO_CLIENT_ID,
  redirect_uri: getCallbackUri(),
  response_type: "code",
  scope: "openid email profile",
  onSigninCallback: () => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.replace("/");
    }
  },
};

export function signOut() {
  if (typeof window === "undefined") return;

  // Clear local OIDC storage tokens
  sessionStorage.clear();
  localStorage.clear();

  if (COGNITO_DOMAIN && COGNITO_CLIENT_ID) {
    const domain = COGNITO_DOMAIN.startsWith("http")
      ? COGNITO_DOMAIN
      : `https://${COGNITO_DOMAIN}`;
    const logoutUrl = `${domain}/logout?client_id=${encodeURIComponent(
      COGNITO_CLIENT_ID,
    )}&logout_uri=${encodeURIComponent(getLogoutUri())}`;
    window.location.href = logoutUrl;
  } else {
    window.location.href = "/";
  }
}
