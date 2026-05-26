import type { IconType } from "react-icons";
import {
  FaCalendarCheck,
  FaChartLine,
  FaGithub,
  FaHardHat,
  FaInstagram,
  FaSearch,
  FaSlack,
  FaToolbox,
  FaTrophy,
  FaUserShield,
} from "react-icons/fa";

type App = {
  label: string;
  href: string;
  icon: IconType;
  bg: string;
  external?: boolean;
};

const APPS: App[] = [
  {
    label: "G3ID",
    href: "https://g3id.g3robotics.com",
    icon: FaUserShield,
    bg: "bg-red-600",
  },
  {
    label: "Attendance",
    href: "https://attendance.g3robotics.com",
    icon: FaCalendarCheck,
    bg: "bg-sky-600",
  },
  {
    label: "Shop",
    href: "https://shop.g3robotics.com",
    icon: FaToolbox,
    bg: "bg-orange-600",
  },
  {
    label: "Pit",
    href: "https://pit.g3robotics.com",
    icon: FaHardHat,
    bg: "bg-yellow-600",
  },
  {
    label: "Scouting",
    href: "https://scouting.g3robotics.com",
    icon: FaSearch,
    bg: "bg-violet-600",
  },
  {
    label: "The Blue Alliance",
    href: "https://www.thebluealliance.com/team/1648",
    icon: FaTrophy,
    bg: "bg-blue-600",
    external: true,
  },
  {
    label: "Statbotics",
    href: "https://www.statbotics.io/team/1648",
    icon: FaChartLine,
    bg: "bg-emerald-600",
    external: true,
  },
  {
    label: "GitHub",
    href: "https://github.com/midtownrobotics",
    icon: FaGithub,
    bg: "bg-gray-700",
    external: true,
  },
  {
    label: "Slack",
    href: "https://g3robotics.slack.com",
    icon: FaSlack,
    bg: "bg-purple-600",
    external: true,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/g3robotics1648/",
    icon: FaInstagram,
    bg: "bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600",
    external: true,
  },
];

export function MembersPage() {
  return (
    <main className="min-h-screen bg-gray-950 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-10">
          <p className="text-red-400 text-sm font-semibold uppercase tracking-widest mb-1">
            Team 1648
          </p>
          <h1 className="text-3xl font-bold text-white">Members</h1>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-x-4 gap-y-8">
          {APPS.map((app) => {
            return (
              <a
                key={app.label}
                href={app.href}
                target={app.external ? "_blank" : undefined}
                rel={app.external ? "noopener noreferrer" : undefined}
                className="flex flex-col items-center gap-2 group"
              >
                <div
                  className={`w-16 h-16 rounded-2xl ${app.bg} flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:scale-110`}
                >
                  <app.icon className="text-white text-3xl" />
                </div>
                <span className="text-xs text-center leading-tight transition-colors text-gray-400 group-hover:text-white">
                  {app.label}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}
