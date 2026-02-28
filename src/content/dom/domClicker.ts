import { randomDelay } from '../../utils/delay';
import { waitForElement } from './domReader';

/**
 * Simulates a human-like click on an element.
 * Dispatches the full mouse event sequence (mousedown → mouseup → click)
 * with slight positional randomization within the element bounds.
 */
export async function humanClick(element: HTMLElement): Promise<void> {
  element.scrollIntoView({ behavior: 'auto', block: 'center' });
  await randomDelay(60, 150);

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + (Math.random() * 6 - 3);
  const y = rect.top + rect.height / 2 + (Math.random() * 6 - 3);

  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    view: window,
  };

  element.dispatchEvent(new MouseEvent('mousedown', opts));
  await randomDelay(20, 60);
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.dispatchEvent(new MouseEvent('click', opts));
}

/**
 * Types text into an input field character by character.
 * Clears the field first, then types with variable inter-key delay.
 */
export async function humanType(
  input: HTMLInputElement,
  text: string
): Promise<void> {
  input.focus();
  input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await randomDelay(50, 150);

  // Clear existing value
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await randomDelay(30, 80);

  // Type character by character
  for (const char of text) {
    input.value += char;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await randomDelay(40, 120);
  }

  // Finalize
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Sets a value in one of EA's custom dropdown filters.
 * These are not native <select> elements — they're custom components
 * that open a list of clickable rows when clicked.
 *
 * @param dropdownSelector - Selector for the dropdown container
 * @param optionText - Text to match (case-insensitive, partial match)
 */
export async function setDropdownFilter(
  dropdownSelector: string,
  optionText: string
): Promise<void> {
  const dropdown = document.querySelector(dropdownSelector) as HTMLElement;
  if (!dropdown) throw new Error(`Dropdown not found: ${dropdownSelector}`);

  // Click to open the dropdown
  await humanClick(dropdown);
  await randomDelay(200, 400);

  // Find the matching option by text content
  const options = dropdown.querySelectorAll('.ut-search-filter-control--row');
  for (const option of options) {
    const text = option.textContent?.trim().toLowerCase() ?? '';
    if (text.includes(optionText.toLowerCase())) {
      await humanClick(option as HTMLElement);
      return;
    }
  }

  throw new Error(`Option "${optionText}" not found in dropdown ${dropdownSelector}`);
}

/**
 * Sets a numeric value in an input field (e.g., price filters).
 * Uses humanType for realistic input, but also handles EA's custom
 * numeric inputs that may need special event dispatching.
 */
export async function setNumericInput(
  selector: string,
  value: number
): Promise<void> {
  const input = await waitForElement(selector) as HTMLInputElement;
  await humanType(input, value.toString());
}

/**
 * Scrolls a container element down by a given amount.
 * Returns true if the scroll position actually changed (not at bottom).
 */
export async function scrollContainer(
  container: HTMLElement,
  amount: number = 500
): Promise<boolean> {
  const prevScrollTop = container.scrollTop;
  container.scrollTop += amount;
  await randomDelay(300, 600);
  return container.scrollTop > prevScrollTop;
}

/**
 * Simulates a key press dispatched on window, document, and document.body.
 * EA's framework may listen on any of these targets.
 * Includes deprecated keyCode/which for compatibility with older event handlers.
 */
export function pressKey(key: string): void {
  // Build proper code value (Digit1 for "1", ArrowDown for "ArrowDown", etc.)
  let code = key;
  let keyCode = 0;
  if (key.length === 1 && key >= '0' && key <= '9') {
    code = `Digit${key}`;
    keyCode = key.charCodeAt(0); // 48-57
  } else if (key === 'ArrowDown') {
    keyCode = 40;
  } else if (key === 'ArrowUp') {
    keyCode = 38;
  }

  const opts: KeyboardEventInit & { keyCode?: number; which?: number } = {
    key, code, bubbles: true, cancelable: true, keyCode, which: keyCode,
  };

  // Dispatch on all common targets — EA may listen on any of them
  for (const target of [window, document, document.body]) {
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
  }
}

/**
 * Clicks a button found by selector, with a short wait for it to appear.
 * Convenience wrapper combining waitForElement + humanClick.
 */
export async function clickButton(
  selector: string,
  timeout: number = 5000
): Promise<void> {
  const btn = await waitForElement(selector, timeout);
  await humanClick(btn);
}
