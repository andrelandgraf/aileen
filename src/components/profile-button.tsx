"use client";

import { useUser } from "@stackframe/stack";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getUserName, getUserInitials } from "@/lib/stack/utils";
import { ThemeSelector } from "@/components/theme/selector";
import { Separator } from "@/components/ui/separator";

export function ProfileButton() {
  const user = useUser();

  if (!user) {
    return null;
  }

  const userName = getUserName(user);
  const initials = getUserInitials(user);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={user.profileImageUrl || undefined}
              alt={userName}
            />
            <AvatarFallback className="text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center space-x-2">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={user.profileImageUrl || undefined}
                alt={userName}
              />
              <AvatarFallback className="text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.primaryEmail}
              </p>
            </div>
          </div>
          <Separator />
          <ThemeSelector />
          <Separator />
          <Button
            variant="ghost"
            className="w-full justify-start text-sm"
            onClick={async () => {
              await user.signOut();
            }}
          >
            Logout
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
