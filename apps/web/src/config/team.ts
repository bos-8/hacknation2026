export type TeamMember = {
  id: string;
  name: string;
  initials: string;
  roles: readonly ("owner" | "architect" | "projectLead")[];
  profileKey?: string;
  image?: string;
  hoverImage?: string;
  linkedin?: string;
  github?: string;
};

/** Public project identity and profile links supplied by the owner. */
export const teamMembers: readonly TeamMember[] = [
  {
    id: "kacper-bos",
    name: "Kacper Boś",
    initials: "KB",
    roles: ["architect", "projectLead"],
    profileKey: "kacper",
    image: "/team/agent-kb22.jpg",
    hoverImage: "/team/thinkpad_in_server_room.gif",
    linkedin: "https://www.linkedin.com/in/kacper-boss",
    github: "https://github.com/bos-8",
  },
];

export const teamPlaceholderCount = 2;
