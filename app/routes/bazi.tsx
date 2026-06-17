import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import type { Route } from "./+types/bazi";

import { DateTimeWheelPicker } from "@/components/date-time-wheel-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·八字" },
    { name: "description", content: "八字占卜" },
  ];
}

type BaziGender = "male" | "female";

const BAZI_GENDER_OPTIONS = [
  { label: "男", value: "male" },
  { label: "女", value: "female" },
] satisfies Array<{ label: string; value: BaziGender }>;

export default function Bazi() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<BaziGender | "">("");
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [genderError, setGenderError] = useState("");

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm"));
  };

  const handleGenderChange = (values: string[]) => {
    const nextGender = values[values.length - 1] as BaziGender | undefined;

    if (!nextGender) {
      return;
    }

    setGender(nextGender);
    setGenderError("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!gender) {
      setGenderError("请选择性别。");
      return;
    }

    setGenderError("");
  };

  return (
    <div className="container relative mx-auto flex min-h-svh items-center px-4 py-16 md:py-20 lg:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">八字排盘</h1>
          <p className="text-sm text-muted-foreground">填写命主信息与出生时间</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-md flex-col gap-5 text-card-foreground animate-in fade-in-0 slide-in-from-bottom-3 duration-300 lg:gap-6"
        >
          <Field>
            <FieldLabel htmlFor="bazi-name">命主姓名（可选）</FieldLabel>
            <Input
              id="bazi-name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="请输入命主姓名"
              autoComplete="name"
            />
          </Field>

          <Field data-invalid={Boolean(genderError)}>
            <FieldLabel id="bazi-gender-label">性别</FieldLabel>
            <ToggleGroup
              aria-labelledby="bazi-gender-label"
              aria-invalid={Boolean(genderError) || undefined}
              value={gender ? [gender] : []}
              onValueChange={handleGenderChange}
              variant="outline"
              spacing={0}
              className="w-full"
            >
              {BAZI_GENDER_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className="flex-1"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <input type="hidden" name="gender" value={gender} />
            {genderError ? <FieldError>{genderError}</FieldError> : null}
          </Field>

          <FieldGroup className="flex-row items-end gap-2">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor="bazi-date-time-picker">出生时间</FieldLabel>
              <DateTimeWheelPicker
                id="bazi-date-time-picker"
                date={date}
                time={time}
                onChange={(nextValue) => {
                  setDate(nextValue.date);
                  setTime(nextValue.time);
                }}
              />
              <input type="hidden" name="birthDate" value={format(date, "yyyy-MM-dd")} />
              <input type="hidden" name="birthTime" value={time} />
            </Field>
            <Button
              type="button"
              variant="outline"
              onClick={handleSetNow}
              className="shrink-0"
            >
              现在
            </Button>
          </FieldGroup>

          <div className="flex justify-center pt-1">
            <Button type="submit" size="lg" className="w-full max-w-xs">
              开始排盘
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
