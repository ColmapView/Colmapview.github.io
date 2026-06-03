import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type WheelEvent,
} from 'react';
import { OPACITY } from '../../theme';
import {
  applyOpacityInputValue,
  getOpacityInputKeyAction,
  getOpacityInputValue,
  getWheelAdjustedOpacity,
} from './imageDetailOpacityViewModel';

export function useImageDetailMatchOpacity(initialOpacity = OPACITY.matchLines) {
  const [matchLineOpacity, setMatchLineOpacity] = useState<number>(initialOpacity);
  const [isEditingOpacity, setIsEditingOpacity] = useState(false);
  const [opacityInputValue, setOpacityInputValue] = useState('');
  const opacityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingOpacity && opacityInputRef.current) {
      opacityInputRef.current.focus();
      opacityInputRef.current.select();
    }
  }, [isEditingOpacity]);

  const handleOpacityDoubleClick = useCallback(() => {
    setOpacityInputValue(getOpacityInputValue(matchLineOpacity));
    setIsEditingOpacity(true);
  }, [matchLineOpacity]);

  const applyOpacityValue = useCallback(() => {
    setMatchLineOpacity((currentOpacity) =>
      applyOpacityInputValue(opacityInputValue, currentOpacity).opacity
    );
    setIsEditingOpacity(false);
  }, [opacityInputValue]);

  const handleOpacityKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    const action = getOpacityInputKeyAction(event.key);
    if (action === 'apply') {
      applyOpacityValue();
    } else if (action === 'cancel') {
      setIsEditingOpacity(false);
    }
  }, [applyOpacityValue]);

  const handleOpacityWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMatchLineOpacity((currentOpacity) =>
      getWheelAdjustedOpacity(currentOpacity, event.deltaY)
    );
  }, []);

  return {
    applyOpacityValue,
    handleOpacityDoubleClick,
    handleOpacityKeyDown,
    handleOpacityWheel,
    isEditingOpacity,
    matchLineOpacity,
    opacityInputRef,
    opacityInputValue,
    setMatchLineOpacity,
    setOpacityInputValue,
  };
}
