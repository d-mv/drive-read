import { onBeforeUnmount, onMounted, ref } from 'vue'

/** navigator.onLine as a ref, kept current while the component is mounted. */
export function useOnline() {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const update = () => (online.value = navigator.onLine)
  onMounted(() => {
    addEventListener('online', update)
    addEventListener('offline', update)
  })
  onBeforeUnmount(() => {
    removeEventListener('online', update)
    removeEventListener('offline', update)
  })
  return online
}
