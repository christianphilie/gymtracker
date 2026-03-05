import type { ReactNode, RefCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ReorderableExerciseCardProps {
  exerciseKey: string;
  reorderMode: boolean;
  isLocked?: boolean;
  cardRef: RefCallback<HTMLDivElement>;
  children: (args: {
    isDragging: boolean;
  }) => ReactNode;
}

export function ReorderableExerciseCard({
  exerciseKey,
  reorderMode,
  isLocked = false,
  cardRef,
  children
}: ReorderableExerciseCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exerciseKey,
    disabled: !reorderMode || isLocked
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition
  };
  const sortableProps = reorderMode && !isLocked
    ? { ...listeners, ...attributes }
    : {};

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        cardRef(node);
      }}
      style={style}
      className={`${
        reorderMode && !isLocked
          ? "touch-none cursor-grab active:cursor-grabbing select-none [-webkit-user-select:none] [-webkit-touch-callout:none] transition-colors"
          : ""
      } ${isDragging ? "shadow-2xl opacity-75 scale-[1.02] z-50" : ""} ${reorderMode && isLocked ? "pointer-events-none opacity-40" : ""}`}
      {...sortableProps}
    >
      {children({ isDragging })}
    </div>
  );
}
