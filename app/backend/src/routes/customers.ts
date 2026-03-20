import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '../middleware'
import { query, queryOne, queryMany } from '../db'

interface CreateCustomerRequest {
  name: string
  contactEmail?: string
  notes?: string
}

interface UpdateCustomerRequest {
  name?: string
  contactEmail?: string
  notes?: string
}

export default async function customerRoutes(app: FastifyInstance) {
  // GET /api/customers — list all customers in the admin's org
  app.get(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
      if (req.user.role === 'user') return reply.status(403).send({ error: 'Admin access required' })

      const currentUser = await queryOne<any>(`SELECT organisation_id FROM users WHERE id = $1`, [req.user.userId])
      const orgId = currentUser?.organisation_id || req.user.organisationId

      const customers = await queryMany<any>(
        `SELECT c.id, c.name, c.contact_email, c.notes, c.created_at,
                COUNT(d.id) AS document_count
         FROM customers c
         LEFT JOIN documents d ON d.customer_id = c.id
         WHERE c.organisation_id = $1
         GROUP BY c.id
         ORDER BY c.name`,
        [orgId],
      )

      return reply.status(200).send(
        customers.map((c) => ({
          id: c.id,
          name: c.name,
          contactEmail: c.contact_email,
          notes: c.notes,
          documentCount: Number(c.document_count),
          createdAt: c.created_at,
        })),
      )
    },
  )

  // POST /api/customers — create a customer
  app.post<{ Body: CreateCustomerRequest }>(
    '/',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
      if (req.user.role === 'user') return reply.status(403).send({ error: 'Admin access required' })

      const { name, contactEmail, notes } = req.body
      if (!name?.trim()) return reply.status(400).send({ error: 'Customer name is required' })

      const currentUser = await queryOne<any>(`SELECT organisation_id FROM users WHERE id = $1`, [req.user.userId])
      const orgId = currentUser?.organisation_id || req.user.organisationId

      const id = uuidv4()
      try {
        await query(
          `INSERT INTO customers (id, organisation_id, name, contact_email, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, orgId, name.trim(), contactEmail || null, notes || null],
        )
      } catch (err: any) {
        if (err.code === '23505') return reply.status(409).send({ error: 'A customer with this name already exists' })
        throw err
      }

      return reply.status(201).send({ id, name: name.trim(), contactEmail: contactEmail || null, notes: notes || null })
    },
  )

  // PUT /api/customers/:id — update a customer
  app.put<{ Params: { id: string }; Body: UpdateCustomerRequest }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
      if (req.user.role === 'user') return reply.status(403).send({ error: 'Admin access required' })

      const { id } = req.params
      const { name, contactEmail, notes } = req.body

      const customer = await queryOne<any>(`SELECT id FROM customers WHERE id = $1`, [id])
      if (!customer) return reply.status(404).send({ error: 'Customer not found' })

      const updates: string[] = []
      const params: any[] = []
      let idx = 1

      if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name.trim()) }
      if (contactEmail !== undefined) { updates.push(`contact_email = $${idx++}`); params.push(contactEmail || null) }
      if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes || null) }

      if (updates.length === 0) return reply.status(400).send({ error: 'No updates provided' })

      params.push(id)
      try {
        await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      } catch (err: any) {
        if (err.code === '23505') return reply.status(409).send({ error: 'A customer with this name already exists' })
        throw err
      }

      return reply.status(200).send({ id, message: 'Customer updated' })
    },
  )

  // DELETE /api/customers/:id — delete a customer (unlinks documents first)
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { onRequest: [authenticate] },
    async (req, reply) => {
      if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
      if (req.user.role !== 'super_admin') return reply.status(403).send({ error: 'Super admin access required' })

      const { id } = req.params

      const customer = await queryOne<any>(`SELECT id FROM customers WHERE id = $1`, [id])
      if (!customer) return reply.status(404).send({ error: 'Customer not found' })

      // Unlink documents (ON DELETE SET NULL handles this in DB, but be explicit)
      await query(`UPDATE documents SET customer_id = NULL WHERE customer_id = $1`, [id])
      await query(`DELETE FROM customers WHERE id = $1`, [id])

      return reply.status(200).send({ message: 'Customer deleted' })
    },
  )
}
