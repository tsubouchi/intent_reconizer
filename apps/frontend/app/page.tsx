import { redirect } from 'next/navigation'

export default function IndexPage() {
  redirect('/router')
  return null
}
