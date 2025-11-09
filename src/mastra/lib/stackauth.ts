import { mainConfig } from "@/lib/config";

export async function getUser(accessToken: string) {
  const response = await fetch("https://api.stack-auth.com/api/v1/users/me", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-stack-project-id": mainConfig.neon.stackProjectId,
      "x-stack-publishable-client-key":
        mainConfig.neon.stackPublishableClientKey,
      "x-stack-secret-server-key": mainConfig.neon.stackSecretServerKey,
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
