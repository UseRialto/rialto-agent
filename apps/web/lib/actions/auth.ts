'use server'

import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { findUserByEmail, findUserById, createUser, updateUser } from '@/lib/auth/users'
import { createSession, getSession, deleteSession } from '@/lib/auth/session'
import {
  CONTRACTOR_CUSTOMIZATION_VERSION,
  defaultContractorCustomization,
  sanitizeLineItemFields,
  sanitizeVendorResponseFields,
  sanitizeContractorCustomization,
} from '@/lib/contractor-customization'

export type FormState = { errors?: Record<string, string[]>; message?: string } | undefined

// --- Login ---
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { email, password } = parsed.data
  const user = await findUserByEmail(email)

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { message: 'Invalid email or password.' }
  }

  await createSession({
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    onboarding_completed: user.onboarding_completed,
  })

  redirect(user.role === 'vendor' ? '/vendor/projects' : '/contractor/projects')
}

// --- Register ---
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['vendor', 'contractor']).optional(),
})

export async function registerAction(_state: FormState, formData: FormData): Promise<FormState> {
  const submittedRole = formData.get('role')
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: submittedRole || undefined,
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, email, password } = parsed.data
  const role = parsed.data.role ?? 'contractor'

  if (await findUserByEmail(email)) {
    return { message: 'An account with this email already exists.' }
  }

  const password_hash = await bcrypt.hash(password, 12)
  const user = await createUser({ email, password_hash, name, role, onboarding_completed: false })

  await createSession({
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    onboarding_completed: false,
  })

  redirect(role === 'vendor' ? '/vendor/onboarding' : '/contractor/onboarding')
}

// --- Logout ---
export async function logoutAction(): Promise<void> {
  await deleteSession()
  redirect('/login')
}

// --- Update Profile ---
const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  company_name: z.string().optional(),
})

export async function updateProfileAction(_state: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession()
  if (!session) return { message: 'Not authenticated.' }

  const parsed = profileSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    company_name: formData.get('company_name') || undefined,
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, email, phone, company_name } = parsed.data
  const existing = await findUserById(session.userId)
  if (!existing) return { message: 'User not found.' }

  // Check email uniqueness if changed
  if (email !== existing.email && await findUserByEmail(email)) {
    return { message: 'That email is already in use.' }
  }

  await updateUser(session.userId, {
    name,
    email,
    company_info: {
      ...existing.company_info,
      phone: phone || existing.company_info?.phone,
      company_name: company_name || existing.company_info?.company_name,
    },
  })

  // Refresh the session cookie with updated name/email
  await createSession({
    userId: session.userId,
    role: session.role,
    name,
    email,
    onboarding_completed: session.onboarding_completed,
  })

  return { message: 'Profile updated successfully.' }
}

// --- Change Password ---
const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password required'),
  new_password: z.string().min(8, 'New password must be at least 8 characters'),
})

export async function changePasswordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession()
  if (!session) return { message: 'Not authenticated.' }

  const parsed = changePasswordSchema.safeParse({
    current_password: formData.get('current_password'),
    new_password: formData.get('new_password'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { current_password, new_password } = parsed.data
  const user = await findUserById(session.userId)
  if (!user) return { message: 'User not found.' }

  const valid = await bcrypt.compare(current_password, user.password_hash)
  if (!valid) return { message: 'Current password is incorrect.' }

  const password_hash = await bcrypt.hash(new_password, 12)
  await updateUser(session.userId, { password_hash })

  return { message: 'Password changed successfully.' }
}

// --- Save Onboarding ---
export async function saveOnboardingAction(_state: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession()
  if (!session) return { message: 'Not authenticated.' }

  const materials = formData.getAll('materials') as string[]
  const certifications = (formData.get('certifications') as string | null)
    ?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  const service_regions = (formData.get('service_regions') as string | null)
    ?.split(',').map((s) => s.trim()).filter(Boolean) ?? []

  const company_name = (formData.get('company_name') as string) || undefined
  const phone = (formData.get('phone') as string) || undefined
  const address = (formData.get('address') as string) || undefined
  const yib = parseInt(formData.get('years_in_business') as string)
  const years_in_business = Number.isFinite(yib) ? yib : undefined

  await updateUser(session.userId, {
    onboarding_completed: true,
    company_info: { company_name, phone, address, materials, certifications, service_regions, years_in_business },
  })

  await createSession({ ...session, onboarding_completed: true })
  redirect('/vendor/projects')
}

// --- Skip Onboarding ---
export async function skipOnboardingAction(): Promise<void> {
  const session = await getSession()
  if (session) {
    await updateUser(session.userId, { onboarding_completed: true })
    await createSession({ ...session, onboarding_completed: true })
  }
  redirect('/vendor/projects')
}

// --- Save Contractor Onboarding ---
export async function saveContractorOnboardingAction(_state: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession()
  if (!session || session.role !== 'contractor') return { message: 'Not authenticated.' }

  const user = await findUserById(session.userId)
  if (!user) return { message: 'User not found.' }

  const company_name = (formData.get('company_name') as string | null)?.trim() || undefined
  const trade = (formData.get('trade') as string | null)?.trim() || undefined
  const request_style = (formData.get('request_style') as string | null)?.trim() || undefined
  const templateJson = (formData.get('template_json') as string | null)?.trim()
  let contractorCustomization = defaultContractorCustomization(trade, trade ? 'trade' : 'default')

  if (templateJson) {
    try {
      const parsedTemplate = JSON.parse(templateJson) as {
        lineItemFields?: unknown
        vendorResponseFields?: unknown
        rfqCreationFieldVisibility?: Record<string, boolean>
        inferenceSource?: 'default' | 'trade' | 'spreadsheet' | 'ai' | 'user' | 'skipped'
        trade?: string
      }
      const parsedFields = parsedTemplate.lineItemFields
      if (Array.isArray(parsedFields) && parsedFields.length === 0) {
        contractorCustomization = {
          trade: trade || parsedTemplate.trade || undefined,
          templateVersion: CONTRACTOR_CUSTOMIZATION_VERSION,
          lineItemFields: [],
          vendorResponseFields: Array.isArray(parsedTemplate.vendorResponseFields) ? sanitizeVendorResponseFields(parsedTemplate.vendorResponseFields) : [],
          rfqCreationFieldVisibility: parsedTemplate.rfqCreationFieldVisibility,
          inferenceSource: parsedTemplate.inferenceSource ?? 'default',
          updatedAt: new Date().toISOString(),
        }
      } else {
        contractorCustomization = sanitizeContractorCustomization(parsedTemplate as Parameters<typeof sanitizeContractorCustomization>[0])
        contractorCustomization = {
          ...contractorCustomization,
          trade: trade || contractorCustomization.trade,
          lineItemFields: sanitizeLineItemFields(contractorCustomization.lineItemFields),
          inferenceSource: contractorCustomization.inferenceSource ?? 'spreadsheet',
          updatedAt: new Date().toISOString(),
        }
      }
    } catch {
      return { message: 'The inferred field template could not be saved. Try uploading the example again.' }
    }
  }

  await updateUser(session.userId, {
    onboarding_completed: true,
    company_info: {
      ...user.company_info,
      company_name: company_name || user.company_info?.company_name,
      contractor_trade: trade,
      contractor_request_style: request_style,
      contractor_customization: contractorCustomization,
    },
  })

  await createSession({ ...session, onboarding_completed: true })
  redirect('/contractor/projects')
}

// --- Skip Contractor Onboarding ---
export async function skipContractorOnboardingAction(): Promise<void> {
  const session = await getSession()
  if (session && session.role === 'contractor') {
    const user = await findUserById(session.userId)
    await updateUser(session.userId, {
      onboarding_completed: true,
      company_info: {
        ...user?.company_info,
        contractor_customization: user?.company_info?.contractor_customization ?? defaultContractorCustomization(undefined, 'skipped'),
      },
    })
    await createSession({ ...session, onboarding_completed: true })
  }
  redirect('/contractor/projects')
}

export async function switchToVendorOnboardingAction(): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await findUserById(session.userId)
  await updateUser(session.userId, {
    role: 'vendor',
    onboarding_completed: false,
    company_info: user?.company_info,
  })
  await createSession({
    ...session,
    role: 'vendor',
    onboarding_completed: false,
  })
  redirect('/vendor/onboarding')
}
