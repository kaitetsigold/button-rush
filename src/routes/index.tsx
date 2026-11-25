import { createFileRoute } from "@tanstack/react-router";
import { Gauntlet } from "@/components/gauntlet";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Gauntlet />;
}
