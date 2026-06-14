import { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface TimePickerProps {
  value: string; // Format: "HH:mm:ss"
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}

export function TimePicker({ value, onChange, id, className }: TimePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState("--:--:--");
  const [cursorPos, setCursorPos] = useState(0);

  // Update display value when prop value changes
  useEffect(() => {
    if (value) {
      setDisplayValue(value);
    }
  }, [value]);

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const clickPos = input.selectionStart || 0;

    // Map click position to time segment
    let newPos = 0;
    if (clickPos >= 6) {
      newPos = 6; // seconds
    } else if (clickPos >= 3) {
      newPos = 3; // minutes
    } else {
      newPos = 0; // hours
    }

    setCursorPos(newPos);
    input.setSelectionRange(newPos, newPos + 2);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;

    // Handle number keys
    if (/^\d$/.test(e.key)) {
      e.preventDefault();

      const parts = displayValue.split(":");
      let hours = parts[0] || "--";
      let minutes = parts[1] || "--";
      let seconds = parts[2] || "--";

      const segmentIndex = Math.floor(cursorPos / 3);
      const posInSegment = cursorPos % 3;

      if (segmentIndex === 0) {
        // Hours
        if (posInSegment === 0) {
          hours = e.key + (hours[1] === "-" ? "-" : hours[1]);
        } else {
          hours = (hours[0] === "-" ? "0" : hours[0]) + e.key;
        }
        const h = parseInt(hours.replace(/-/g, "0"));
        if (h > 23) hours = "23";
      } else if (segmentIndex === 1) {
        // Minutes
        if (posInSegment === 0) {
          minutes = e.key + (minutes[1] === "-" ? "-" : minutes[1]);
        } else {
          minutes = (minutes[0] === "-" ? "0" : minutes[0]) + e.key;
        }
        const m = parseInt(minutes.replace(/-/g, "0"));
        if (m > 59) minutes = "59";
      } else if (segmentIndex === 2) {
        // Seconds
        if (posInSegment === 0) {
          seconds = e.key + (seconds[1] === "-" ? "-" : seconds[1]);
        } else {
          seconds = (seconds[0] === "-" ? "0" : seconds[0]) + e.key;
        }
        const s = parseInt(seconds.replace(/-/g, "0"));
        if (s > 59) seconds = "59";
      }

      const newValue = `${hours}:${minutes}:${seconds}`;
      setDisplayValue(newValue);

      // Move to next position
      let newPos = cursorPos + 1;
      if (newPos === 2 || newPos === 5) newPos++; // Skip colon
      if (newPos >= 8) newPos = 6; // Stay at end

      setCursorPos(newPos);
      setTimeout(() => {
        input.setSelectionRange(newPos, newPos);
      }, 0);

      // Update parent if complete
      if (!newValue.includes("-")) {
        onChange(newValue);
      }
    }
    // Handle arrow keys and tab
    else if (e.key === "ArrowRight" || e.key === "Tab") {
      e.preventDefault();
      let newPos = cursorPos + 3;
      if (newPos > 6) newPos = 6;
      setCursorPos(newPos);
      input.setSelectionRange(newPos, newPos + 2);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      let newPos = cursorPos - 3;
      if (newPos < 0) newPos = 0;
      setCursorPos(newPos);
      input.setSelectionRange(newPos, newPos + 2);
    }
    // Handle backspace/delete
    else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const parts = displayValue.split(":");
      const segmentIndex = Math.floor(cursorPos / 3);

      if (segmentIndex === 0) {
        parts[0] = "--";
      } else if (segmentIndex === 1) {
        parts[1] = "--";
      } else if (segmentIndex === 2) {
        parts[2] = "--";
      }

      const newValue = parts.join(":");
      setDisplayValue(newValue);
      if (!newValue.includes("-")) {
        onChange(newValue);
      }
    }
  };

  const handleFocus = () => {
    if (inputRef.current) {
      setCursorPos(0);
      inputRef.current.setSelectionRange(0, 2);
    }
  };

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      placeholder="--:--:--"
      className={`font-mono text-center ${className || ""}`}
      readOnly
    />
  );
}
