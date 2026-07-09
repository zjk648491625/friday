// Modified by Friday AI Team - Rebranded from Continue
import React, { useContext, useEffect, useRef, useState } from "react";
import useIsOSREnabled from "../hooks/useIsOSREnabled";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { T } from "../util/i18n";

interface Position {
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
}

const OSRContextMenu = () => {
  const ideMessenger = useContext(IdeMessengerContext);
  const isOSREnabled = useIsOSREnabled();

  const [position, setPosition] = useState<Position | null>(null);
  const [canCopy, setCanCopy] = useState(false);
  const [canCut, setCanCut] = useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const selectedTextRef = useRef<string | null>(null);
  const selectedRangeRef = useRef<Range | null>(null);

  function onMenuItemClick(
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) {
    event.preventDefault();
    if (selectedRangeRef.current) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(selectedRangeRef.current);
    }
    setPosition(null);
  }

  useEffect(() => {
    function leaveWindowHandler() {
      setPosition(null);
    }
    function clickHandler(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setPosition(null);
      }

      if (event.button === 2) {
        event.preventDefault();

        selectedRangeRef.current = null;
        selectedTextRef.current = null;

        const selection = window.getSelection();
        let isClickWithinSelection = false;
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const selectedText = range.toString();
          selectedRangeRef.current = range.cloneRange();

          if (selectedText.length > 0) {
            selectedTextRef.current = selectedText;
            const rects = range.getClientRects();
            for (let i = 0; i < rects.length; i++) {
              const rect = rects[i];
              if (
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom
              ) {
                isClickWithinSelection = true;
                break;
              }
            }
          }
        }

        let isEditable = false;
        if (
          event.target &&
          "isContentEditable" in event.target &&
          typeof event.target.isContentEditable === "boolean"
        ) {
          isEditable = event.target.isContentEditable;
        }

        setCanCopy(!!selectedTextRef.current && isClickWithinSelection);
        setCanCut(
          !!(isEditable && selectedTextRef.current && isClickWithinSelection),
        );

        const toRight = event.clientX > window.innerWidth / 2;
        const toBottom = event.clientY > window.innerHeight / 2;
        if (toRight) {
          if (toBottom) {
            setPosition({
              bottom: window.innerHeight - event.clientY,
              right: window.innerWidth - event.clientX,
            });
          } else {
            setPosition({
              top: event.clientY,
              right: window.innerWidth - event.clientX,
            });
          }
        } else {
          if (toBottom) {
            setPosition({
              bottom: window.innerHeight - event.clientY,
              left: event.clientX,
            });
          } else {
            setPosition({
              top: event.clientY,
              left: event.clientX,
            });
          }
        }
      }
    }

    setPosition(null);
    if (isOSREnabled) {
      document.addEventListener("mousedown", clickHandler);
      document.addEventListener("mouseleave", leaveWindowHandler);
    }

    return () => {
      document.removeEventListener("mousedown", clickHandler);
      document.removeEventListener("mouseleave", leaveWindowHandler);
    };
  }, [isOSREnabled]);

  if (!isOSREnabled || !position) {
    return null;
  }
  return (
    <div
      className="bg-vsc-editor-background absolute flex flex-col gap-1.5 overflow-hidden rounded-md border border-solid border-gray-500 px-3 py-1.5"
      style={{ ...position, zIndex: 9999 }}
      ref={menuRef}
    >
      {canCopy && (
        <div
          className="cursor-pointer hover:opacity-90"
          onClick={(e) => {
            onMenuItemClick(e);
            document.execCommand("copy");
          }}
        >
          {T("Copy")}
        </div>
      )}
      {canCut && (
        <div
          className="cursor-pointer hover:opacity-90"
          onClick={(e) => {
            onMenuItemClick(e);
            document.execCommand("cut");
          }}
        >
          {T("Cut")}
        </div>
      )}
    </div>
  );
};

export default OSRContextMenu;
