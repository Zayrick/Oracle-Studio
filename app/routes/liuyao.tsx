import { useState } from "react";
import { format } from "date-fns";
import { ChevronDownIcon } from "lucide-react";
import type { Route } from "./+types/liuyao";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "六爻 - 占卜大师" },
    { name: "description", content: "六爻占卜" },
  ];
}

type YaoType = "阴" | "阳";

interface Yao {
  type: YaoType;
  moving: boolean;
}

const YAO_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

export default function Liuyao() {
  const [question, setQuestion] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState(
    format(new Date(), "HH:mm:ss")
  );

  const [yaos, setYaos] = useState<Yao[]>(
    Array(6).fill({ type: "阳", moving: false })
  );

  const handleSetNow = () => {
    const now = new Date();
    setDate(now);
    setTime(format(now, "HH:mm:ss"));
  };

  const toggleYaoType = (index: number) => {
    setYaos((prev) =>
      prev.map((yao, i) =>
        i === index
          ? { ...yao, type: yao.type === "阳" ? "阴" : "阳" }
          : yao
      )
    );
  };

  const toggleYaoMoving = (index: number) => {
    setYaos((prev) =>
      prev.map((yao, i) =>
        i === index ? { ...yao, moving: !yao.moving } : yao
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log({
      question,
      date,
      time,
      yaos,
    });
    // 后续占卜逻辑
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">六爻占卜</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 所问之事 */}
          <Field>
            <FieldLabel htmlFor="question">所问之事</FieldLabel>
            <Input
              id="question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="请输入您要占问的事情"
              required
            />
          </Field>

          {/* 占问时间 */}
          <div>
            <FieldLabel className="mb-2 block">占问时间</FieldLabel>
            <div className="flex items-end gap-2">
              <FieldGroup className="flex-row">
                <Field>
                  <FieldLabel htmlFor="date-picker">日期</FieldLabel>
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          id="date-picker"
                          className="w-40 justify-between font-normal"
                        >
                          {date ? format(date, "yyyy年MM月dd日") : "选择日期"}
                          <ChevronDownIcon data-icon="inline-end" />
                        </Button>
                      }
                    />
                    <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        captionLayout="dropdown"
                        defaultMonth={date}
                        onSelect={(selectedDate) => {
                          if (selectedDate) {
                            setDate(selectedDate);
                            setDateOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
                <Field className="w-40">
                  <FieldLabel htmlFor="time-picker">时间</FieldLabel>
                  <Input
                    type="time"
                    id="time-picker"
                    step="1"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                </Field>
              </FieldGroup>
              <Button
                type="button"
                variant="outline"
                onClick={handleSetNow}
                className="mb-[1px]"
              >
                现在
              </Button>
            </div>
          </div>

          {/* 所得之卦 */}
          <div>
            <FieldLabel className="mb-4 block">所得之卦</FieldLabel>
            <div className="space-y-3">
              {yaos.map((yao, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center gap-6"
                >
                  {/* 左侧：爻名 */}
                  <div className="w-16 text-right font-medium">
                    {YAO_NAMES[index]}
                  </div>

                  {/* 中间：阴阳爻切换 */}
                  <button
                    type="button"
                    onClick={() => toggleYaoType(index)}
                    className="relative w-32 h-12 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {yao.type === "阳" ? (
                      // 阳爻：实线
                      <div className="w-full h-2 bg-foreground rounded" />
                    ) : (
                      // 阴爻：断开的线
                      <div className="w-full flex gap-2">
                        <div className="flex-1 h-2 bg-foreground rounded" />
                        <div className="flex-1 h-2 bg-foreground rounded" />
                      </div>
                    )}
                  </button>

                  {/* 右侧：动爻标记 */}
                  <button
                    type="button"
                    onClick={() => toggleYaoMoving(index)}
                    className={`w-16 h-10 rounded-lg border-2 flex items-center justify-center font-medium transition-colors ${
                      yao.moving
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-muted hover:border-muted-foreground"
                    }`}
                  >
                    动
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 开始占卜按钮 */}
          <div className="flex justify-center pt-4">
            <Button type="submit" size="lg" className="w-full max-w-xs">
              开始占卜
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
