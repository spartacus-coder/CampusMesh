<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../../lib/utils";

interface Props {
  modelValue?: string | number;
  class?: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
  type: "text",
  disabled: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string | number): void;
}>();

const classes = computed(() =>
  cn(
    "flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
    props.class,
  ),
);

function onInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit("update:modelValue", target.value);
}
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="classes"
    @input="onInput"
  />
</template>
