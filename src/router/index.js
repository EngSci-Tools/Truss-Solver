import Vue from 'vue'
import VueRouter from 'vue-router'
import Home from '../views/Home.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'Home',
    redirect: '/trusstwo',
    component: Home
  },
  {
    path: '/truss',
    name: 'Trusses',
    component: () => import('@/views/Trusses')
  },
  {
    path: '/trusstwo',
    name: 'Trusses2',
    component: () => import('@/views/TrussesV2')
  }
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

export default router
