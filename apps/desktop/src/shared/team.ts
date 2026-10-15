import { z } from "zod";

export const codingClientSchema = z.enum(["claude-code", "codex"]);
export type CodingClient = z.infer<typeof codingClientSchema>;
const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const memberInputSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[^<>\r\n]+$/),
  email: z.email().max(254),
});
export const teamMemberSchema = memberInputSchema.extend({
  id: z.string().uuid(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;
export const storedTeamSchema = z
  .looseObject({
    members: z.array(teamMemberSchema).max(200),
    me: z.string().uuid().nullable(),
    projects: z.record(
      z.string().max(4096),
      z.array(z.string().uuid()).max(200),
    ),
  })
  .superRefine((team, context) => {
    const ids = new Set(team.members.map((member) => member.id));
    if (
      ids.size !== team.members.length ||
      new Set(team.members.map((member) => member.email.toLowerCase())).size !==
        team.members.length
    )
      context.addIssue({
        code: "custom",
        message: "Team members must have distinct identities",
      });
    if (team.me && !ids.has(team.me))
      context.addIssue({
        code: "custom",
        message: "Me must refer to a Team member",
      });
    for (const selected of Object.values(team.projects))
      if (
        new Set(selected).size !== selected.length ||
        selected.some((id) => !ids.has(id))
      )
        context.addIssue({
          code: "custom",
          message: "Project members must refer to distinct Team members",
        });
  });
export const teamViewSchema = z.strictObject({
  members: z.array(teamMemberSchema),
  me: z.string().uuid().nullable(),
  projectMembers: z.array(z.string().uuid()),
  revision,
});
export type TeamView = z.infer<typeof teamViewSchema>;
export const teamRequestSchemas = [
  memberInputSchema.extend({ command: z.literal("team-add"), revision }),
  z.strictObject({
    command: z.literal("team-remove"),
    id: z.string().uuid(),
    revision,
  }),
  z.strictObject({
    command: z.literal("team-me"),
    id: z.string().uuid().nullable(),
    revision,
  }),
  z.strictObject({
    command: z.literal("team-project-member"),
    id: z.string().uuid(),
    enabled: z.boolean(),
    revision,
  }),
] as const;
export const teamRequestSchema = z.discriminatedUnion(
  "command",
  teamRequestSchemas,
);
export type TeamRequest = z.infer<typeof teamRequestSchema>;
export const isTeamRequest = (input: {
  command: string;
}): input is TeamRequest => teamRequestSchema.safeParse(input).success;
export const memberIdentity = (member: TeamMember): string =>
  `${member.name} <${member.email}>`;
export function defaultAssignee(team: TeamView): string {
  const member = team.members.find(
    (member) =>
      member.id === team.me && team.projectMembers.includes(member.id),
  );
  return member ? memberIdentity(member) : "";
}
export function assigneeOptions(
  team: TeamView,
  current = "",
): { value: string; label: string; previous: boolean }[] {
  const options = team.members
    .filter((member) => team.projectMembers.includes(member.id))
    .map((member) => ({
      value: memberIdentity(member),
      label: `${member.name} · ${member.email}${member.id === team.me ? " (Me)" : ""}`,
      previous: false,
    }));
  if (current && !options.some((option) => option.value === current))
    options.push({
      value: current,
      label: `${current} (previous assignment)`,
      previous: true,
    });
  return options;
}
