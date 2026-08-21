'use client'

import { Monitor, Moon, Sun } from 'lucide-react'

import { useIsHydrated, useTheme, type Theme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  // The server cannot know the stored preference, so the icon renders as a
  // blank placeholder of the same size until hydration — that keeps the header
  // from shifting when the real icon swaps in.
  const isHydrated = useIsHydrated()

  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[1]!
  const TriggerIcon = resolvedTheme === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${current.label}. Change theme`}>
          {isHydrated ? (
            <TriggerIcon aria-hidden="true" />
          ) : (
            <span className="size-4" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            aria-current={theme === value ? 'true' : undefined}
            className={theme === value ? 'text-foreground font-medium' : undefined}
          >
            <Icon aria-hidden="true" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
