import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/bazi";

import { BaziPaipanTable } from "@/components/bazi-paipan-table";
import { DateTimeWheelPicker } from "@/components/date-time-wheel-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BaziGender, BaziPaipan } from "@/features/bazi/paipan";
import { cn } from "@/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·八字" },
    { name: "description", content: "八字占卜" },
  ];
}

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
  const [calculationError, setCalculationError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [paipan, setPaipan] = useState<BaziPaipan | null>(null);

  const handleBackToForm = () => {
    setPaipan(null);
    setCalculationError("");
  };

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm"));
    setCalculationError("");
  };

  const handleGenderChange = (values: string[]) => {
    const nextGender = values[values.length - 1] as BaziGender | undefined;

    if (!nextGender) {
      return;
    }

    setGender(nextGender);
    setGenderError("");
    setCalculationError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!gender) {
      setGenderError("请选择性别。");
      setPaipan(null);
      return;
    }

    setGenderError("");

    try {
      setIsCalculating(true);
      const { buildBaziPaipan } = await import("@/features/bazi/paipan");
      setPaipan(buildBaziPaipan({ name, gender, date, time }));
      setCalculationError("");
    } catch (error) {
      console.error(error);
      setPaipan(null);
      setCalculationError("排盘失败，请检查出生时间后重试。");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div
      className={cn(
        paipan
          ? "relative mx-auto flex min-h-svh w-full px-4 pb-10 pt-20 md:px-6 md:pt-24 lg:px-8"
          : "container relative mx-auto flex min-h-svh items-center px-4 py-16 md:py-20 lg:py-10"
      )}
    >
      {paipan ? (
        <BaziResultPage paipan={paipan} onBack={handleBackToForm} />
      ) : (
        <>
          <Link
            to="/"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "fixed left-4 top-4 z-20"
            )}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            返回主页
          </Link>

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
                  onChange={(event) => {
                    setName(event.target.value);
                    setCalculationError("");
                  }}
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
                      setCalculationError("");
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
                <Button type="submit" size="lg" disabled={isCalculating} className="w-full max-w-xs">
                  {isCalculating ? "排盘中..." : "开始排盘"}
                </Button>
              </div>

              {calculationError ? (
                <p role="alert" className="text-center text-sm text-destructive">
                  {calculationError}
                </p>
              ) : null}
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function BaziResultPage({
  paipan,
  onBack,
}: {
  paipan: BaziPaipan;
  onBack: () => void;
}) {
  return (
    <section className="flex w-full flex-col" aria-label="八字排盘结果">
      <div className="fixed inset-x-0 top-0 z-20 h-16 border-b bg-background/95 backdrop-blur md:left-[224px]">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center px-4 md:px-6 lg:px-8">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            返回填写
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <BaziPaipanTable paipan={paipan} />
      </div>
    </section>
  );
}
