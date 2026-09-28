import { apps, team } from "@g3/config";

/** The G3ID app name with the team's short name highlighted, e.g. <span>G3</span>ID. */
export function BrandName() {
  const name = apps.g3id.name;
  if (!name.startsWith(team.shortName)) return <>{name}</>;
  return (
    <>
      <span className="text-primary-500">{team.shortName}</span>
      {name.slice(team.shortName.length)}
    </>
  );
}
