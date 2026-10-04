import { createRouter, createWebHistory } from 'vue-router'

import { useLibrary } from '@/stores/library'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'library',
      component: () => import('@/views/LibraryView.vue'),
      // First run: an empty library opens on the welcome screen.
      beforeEnter: () => (useLibrary().books.length === 0 ? { name: 'welcome' } : true),
    },
    { path: '/welcome', name: 'welcome', component: () => import('@/views/ConnectView.vue') },
    { path: '/drive', name: 'drive', component: () => import('@/views/DriveView.vue') },
    {
      path: '/read/:id',
      name: 'reader',
      component: () => import('@/views/ReaderView.vue'),
      props: true,
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
