import { buildOAuthRedirect } from "./redirect-allowlist";

export const config = { runtime: "edge" };

const handler = (request: Request): Response => {
  const url = new URL(request.url);
  const result = buildOAuthRedirect({
    code: url.searchParams.get("code"),
    error: url.searchParams.get("error"),
    errorDescription: url.searchParams.get("error_description"),
    state: url.searchParams.get("state"),
  });

  if (!result.ok) {
    return new Response("Invalid redirect target", { status: 400 });
  }

  return Response.redirect(result.location, 302);
};

export default handler;
