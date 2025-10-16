export async function getUser(accessToken: string) {
  const response = await fetch("https://api.stack-auth.com/api/v1/users/me", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-stack-project-id": process.env.NEXT_PUBLIC_STACK_PROJECT_ID!,
      "x-stack-publishable-client-key":
        process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY!,
      "x-stack-secret-server-key": process.env.STACK_SECRET_SERVER_KEY!,
      "x-stack-access-type": "server",
      "x-stack-access-token": accessToken,
    },
  });

  if (!response.ok) {
    console.error("[StackAuth] Failed to get user:", response.statusText);
    return null;
  }

  const data = await response.json();
  return data;
}
