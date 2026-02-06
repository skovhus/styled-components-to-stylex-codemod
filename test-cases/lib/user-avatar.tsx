import React from "react";

// Mimics real UserAvatar component with strict props.
// Accepts className and style but NOT arbitrary $transient props.
export interface UserAvatarProps {
  className?: string;
  style?: React.CSSProperties;
  size?: "tiny" | "small" | "regular";
  user: string;
}

export function UserAvatar({ className, style, size = "regular", user }: UserAvatarProps) {
  return (
    <div className={className} style={style}>
      <span>
        {user} ({size})
      </span>
    </div>
  );
}
