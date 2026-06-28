import {
  MonitorIcon,
  MoonIcon,
  SunIcon,
  type LucideIcon,
} from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { useTheme, type Theme } from "@/components/theme-provider";
import type { Route } from "./+types/settings";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·设置" },
    { name: "description", content: "设置" },
  ];
}

export default function Settings() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className="container mx-auto px-4 py-10 md:py-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
          <p className="text-sm text-muted-foreground">偏好会保存在当前浏览器。</p>
        </header>

        <FieldGroup>
          <Field className="rounded-md border bg-card p-4 text-card-foreground">
            <FieldContent>
              <FieldLabel>外观</FieldLabel>
              <FieldDescription>
                当前显示：{resolvedTheme === "dark" ? "深色" : "浅色"}
              </FieldDescription>
            </FieldContent>

            <ToggleGroup
              aria-label="外观"
              className="w-full flex-wrap sm:w-fit"
              spacing={0}
              value={[theme]}
              variant="outline"
              onValueChange={(value) => {
                const nextTheme = value[0];

                if (isTheme(nextTheme)) {
                  setTheme(nextTheme);
                }
              }}
            >
              {themeOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <ToggleGroupItem
                    key={option.value}
                    aria-label={option.label}
                    className="min-w-24 flex-1 sm:flex-none"
                    value={option.value}
                  >
                    <Icon data-icon="inline-start" aria-hidden="true" />
                    {option.label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      </div>
    </div>
  );
}

const themeOptions: Array<{
  value: Theme;
  label: string;
  icon: LucideIcon;
}> = [
  {
    value: "light",
    label: "浅色",
    icon: SunIcon,
  },
  {
    value: "dark",
    label: "深色",
    icon: MoonIcon,
  },
  {
    value: "system",
    label: "系统",
    icon: MonitorIcon,
  },
];

function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}
