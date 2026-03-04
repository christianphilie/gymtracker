import type { CSSProperties, ReactNode, RefCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

const DRAGGABLE_ID_PREFIX = "session-exercise:";
const DROP_BEFORE_ID_PREFIX = "session-drop-before:";
const DROP_AFTER_LAST_ID = "session-drop-after-last";

interface ReorderableExerciseCardProps {
  exerciseKey: string;
  isLast: boolean;
  reorderMode: boolean;
  cardRef: RefCallback<HTMLDivElement>;
  children: (args: {
    isDragging: boolean;
    dragHandleAttributes?: Record<string, unknown>;
    dragHandleListeners?: Record<string, unknown>;
  }) => ReactNode;
}

export function getDragExerciseKey(value: unknown) {
  if (typeof value !== "string" || !value.startsWith(DRAGGABLE_ID_PREFIX)) return null;
  return value.slice(DRAGGABLE_ID_PREFIX.length) || null;
}

export function getDropBeforeExerciseKey(value: unknown) {
  if (typeof value !== "string" || !value.startsWith(DROP_BEFORE_ID_PREFIX)) return null;
  return value.slice(DROP_BEFORE_ID_PREFIX.length) || null;
}

export function isDropAfterLast(value: unknown) {
  return value === DROP_AFTER_LAST_ID;
}

export function ReorderableExerciseCard({
  exerciseKey,
  isLast,
  reorderMode,
  cardRef,
  children
}: ReorderableExerciseCardProps) {
  const draggable = useDraggable({
    id: `${DRAGGABLE_ID_PREFIX}${exerciseKey}`,
    disabled: !reorderMode
  });
  const dropBefore = useDroppable({
    id: `${DROP_BEFORE_ID_PREFIX}${exerciseKey}`,
    disabled: !reorderMode
  });
  const dropAfterLast = useDroppable({
    id: DROP_AFTER_LAST_ID,
    disabled: !reorderMode || !isLast
  });

  const dragStyle: CSSProperties | undefined = draggable.transform
    ? {
        transform: `translate3d(${Math.round(draggable.transform.x)}px, ${Math.round(draggable.transform.y)}px, 0)`,
        zIndex: draggable.isDragging ? 30 : undefined
      }
    : undefined;

  return (
    <div className="space-y-1.5">
      {reorderMode && (
        <div
          ref={dropBefore.setNodeRef}
          className={`h-2 rounded-full border border-dashed transition-colors ${
            dropBefore.isOver ? "border-emerald-500 bg-emerald-100/80 dark:bg-emerald-900/40" : "border-border/60"
          }`}
        />
      )}

      <div
        ref={(node) => {
          draggable.setNodeRef(node);
          cardRef(node);
        }}
        className={draggable.isDragging ? "opacity-85" : undefined}
        style={dragStyle}
      >
        {children({
          isDragging: draggable.isDragging,
          dragHandleAttributes: reorderMode ? (draggable.attributes as unknown as Record<string, unknown>) : undefined,
          dragHandleListeners: reorderMode ? (draggable.listeners as Record<string, unknown>) : undefined
        })}
      </div>

      {reorderMode && isLast && (
        <div
          ref={dropAfterLast.setNodeRef}
          className={`h-2 rounded-full border border-dashed transition-colors ${
            dropAfterLast.isOver ? "border-emerald-500 bg-emerald-100/80 dark:bg-emerald-900/40" : "border-border/60"
          }`}
        />
      )}
    </div>
  );
}
