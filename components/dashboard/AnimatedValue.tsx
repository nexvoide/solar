"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedValueProps {
  value: string;
  className?: string;
}

export default function AnimatedValue({ value, className = "" }: AnimatedValueProps) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (value !== prev.current && value !== "—") {
      setFlash(true);
      prev.current = value;
      const t = setTimeout(() => setFlash(false), 450);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  return (
    <span className={`inline-block tabular-nums ${flash ? "value-flash" : ""} ${className}`}>
      {value}
    </span>
  );
}
