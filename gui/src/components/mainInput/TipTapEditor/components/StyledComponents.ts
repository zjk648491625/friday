import styled from "styled-components";
import {
  lightGray,
  vscBadgeBackground,
  vscCommandCenterActiveBorder,
  vscCommandCenterInactiveBorder,
  vscForeground,
  vscInputBackground,
  vscInputBorderFocus,
} from "../../..";
import { getFontSize } from "../../../../util";

export const InputBoxDiv = styled.div<{}>`
  resize: none;
  font-family: inherit;
  border-radius: 0.75rem;
  padding-bottom: 1px;
  margin: 0;
  height: auto;
  background-color: ${vscInputBackground};
  color: ${vscForeground};

  border: 1.5px solid ${vscCommandCenterInactiveBorder};
  border-left: 3px solid rgba(59, 130, 246, 0.4);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.05);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  &:focus-within {
    border-color: ${vscCommandCenterActiveBorder};
    border-left: 3px solid rgba(59, 130, 246, 0.7);
    box-shadow: 0 2px 12px rgba(59, 130, 246, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  outline: none;
  font-size: ${getFontSize()}px;

  &:focus {
    outline: none;
    border-color: ${vscInputBorderFocus};
  }

  &::placeholder {
    color: ${lightGray}cc;
  }

  display: flex;
  flex-direction: column;
`;

export const HoverDiv = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  opacity: 0.5;
  background-color: ${vscBadgeBackground};
  color: ${vscForeground};
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const HoverTextDiv = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  color: ${vscForeground};
  display: flex;
  align-items: center;
  justify-content: center;
`;
