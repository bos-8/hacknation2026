import { Archive, ArchiveFill, CheckCircle, CheckCircleFill, Hourglass, HourglassSplit, PauseCircle, PauseCircleFill } from "react-bootstrap-icons";

export const catalogStatusActions = [
  { status: "active", icon: CheckCircle, filledIcon: CheckCircleFill, color: "border-success text-success hover:bg-success hover:text-success-foreground" },
  { status: "inactive", icon: PauseCircle, filledIcon: PauseCircleFill, color: "border-input-border text-muted-foreground hover:bg-muted-foreground hover:text-background" },
  { status: "pending_archiving", icon: Archive, filledIcon: ArchiveFill, color: "border-warning text-warning hover:bg-warning hover:text-warning-foreground" },
  { status: "pending_deletion", icon: Hourglass, filledIcon: HourglassSplit, color: "border-danger text-danger hover:bg-danger hover:text-danger-foreground" },
] as const;
