import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** The trigger of the labkit select whose row is labeled `label`. */
export function picker(label: string | RegExp, scope: HTMLElement = document.body): HTMLElement {
  return within(scope).getByLabelText(label, { selector: 'button' })
}

/** Opens the select labeled `label` and picks the option named `option`. */
export async function choose(
  label: string | RegExp,
  option: string | RegExp,
  scope?: HTMLElement,
): Promise<void> {
  await userEvent.click(picker(label, scope))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

/** The names of every option the select labeled `label` offers. */
export async function optionsOf(label: string | RegExp, scope?: HTMLElement): Promise<string[]> {
  await userEvent.click(picker(label, scope))
  const names = (await screen.findAllByRole('option')).map((el) => el.textContent ?? '')
  await userEvent.keyboard('{Escape}')
  return names
}
