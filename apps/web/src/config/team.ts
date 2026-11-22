export type TeamMember = {
  id: string;
  name: string;
  initials: string;
  roles: readonly ("owner" | "architect" | "projectLead" | "aiLead" | "uiUx" | "projectManager" | "seniorDeveloper" | "trainer" | "midDeveloper" | "ciCd")[];
  profileKey?: string;
  image?: string;
  imagePosition?: string;
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
    imagePosition: "center 20%",
    hoverImage: "/team/thinkpad_in_server_room.gif",
    linkedin: "https://www.linkedin.com/in/kacper-boss",
    github: "https://github.com/bos-8",
  },
  {
    id: "jakub-mielcarek",
    name: "Jakub Mielcarek",
    initials: "JM",
    roles: ["aiLead", "uiUx"],
    profileKey: "jakub",
    image: "/team/jakub-mielcarek.png",
    linkedin: "https://www.linkedin.com/in/mielcarekjakub/",
    github: "https://github.com/vGiacomov",
  },
  {
    id: "natalia-balicka",
    name: "Balicka Natalia",
    initials: "NB",
    roles: ["owner", "projectManager"],
    profileKey: "natalia",
    image: "/team/natalia-balicka-portrait.webp",
    imagePosition: "center 10%",
    linkedin: "https://www.linkedin.com/in/natalia-balicka",
    github: "https://github.com/balickanatalka",
  },
  {
    id: "yurii-holovko",
    name: "Yurii Holovko",
    initials: "YH",
    roles: ["seniorDeveloper", "trainer"],
    profileKey: "yurii",
    image: "/team/yurii-holovko.webp",
    linkedin: "https://www.linkedin.com/in/yurii-holovko/",
    github: "https://github.com/Yurich3112",
  },
  {
    id: "stanislaw-walga",
    name: "Stanisław Wałga",
    initials: "SW",
    roles: ["midDeveloper", "ciCd"],
    profileKey: "stanislaw",
    image: "/team/stanislaw-walga-portrait.webp",
    linkedin: "https://www.linkedin.com/in/stanislaw-walga/",
    github: "https://github.com/Aglawxd",
  },
];
