<script setup lang="ts">
import { computed } from "vue";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-white shadow",
        secondary: "border-transparent bg-surface-subtle text-textSecondary",
        destructive: "border-transparent bg-destructive text-white shadow",
        success: "border-transparent bg-success text-white shadow",
        outline: "border-border text-textPrimary",
        subtle: "border-primary/20 bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface Props {
  variant?: VariantProps<typeof badgeVariants>["variant"];
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
});

const classes = computed(() =>
  cn(badgeVariants({ variant: props.variant }), props.class),
);
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
