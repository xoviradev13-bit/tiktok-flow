import { cn } from "@/lib/utils";
import { motion, MotionValue, useMotionValueEvent, useAnimation, type Transition } from "framer-motion";
import React, { useEffect } from "react";

interface EntangledStringsProps {
  pathLengths: Array<number | MotionValue<number>>;
  paths: string[];
  filterPaths: string[];
  colors: string[];
  title?: string;
  description?: string;
  className?: string;
}

const transition: Transition = {
  duration: 10,
  ease: "linear",
  repeat: Infinity,
  repeatType: "mirror",
};

export const EntangledStrings: React.FC<EntangledStringsProps> = ({
  pathLengths,
  paths,
  filterPaths,
  colors,
  className,
}) => {
  const controls = useAnimation();

  // Helper to unwrap MotionValue or number
  const getValue = (val: number | MotionValue<number>) =>
    typeof val === "number" ? val : val.get();

  // Animate on mount
  useEffect(() => {
    controls.start((i) => ({
      pathLength: getValue(pathLengths[i]),
      transition: transition,
    }));
  }, [controls, pathLengths]);

  // Listen to MotionValue changes (for scroll-linked animation)
  // FIXED: Move the hook listeners into a useEffect
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    
    pathLengths.forEach((val, i) => {
      if (typeof val !== "number") {
        const unsubscribe = val.on("change", (latest) => {
          controls.set((index) => {
            if (index === i) {
              return { pathLength: latest };
            }
            return {};
          });
        });
        unsubscribers.push(unsubscribe);
      }
    });
  
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [pathLengths, controls]);

  return (
    <div className={cn("relative h-full", className)}>
      <svg
        width="1560"
        height="890"
        viewBox="0 0 1560 890"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute w-full -top-[340px]"
      >
        {paths.map((path, index) => (
          <motion.path
            key={index}
            d={path}
            stroke={colors[index]}
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={controls}
            custom={index}
          />
        ))}

        {filterPaths.map((filterPath, index) => (
          <path
            key={index}
            d={filterPath}
            stroke={colors[index]}
            strokeWidth="2"
            fill="none"
            pathLength={1}
            filter="url(#blurMe)"
          />
        ))}

        <defs>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
          </filter>
        </defs>
      </svg>
    </div>
  );
};
