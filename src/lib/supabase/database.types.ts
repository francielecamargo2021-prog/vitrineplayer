
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "athlete_achievements": {
                  Row: {
                    "athlete_id": string,"competition": string | null,"created_at": string,"id": string,"position": number,"title": string,"year": number | null
                  }
                  Insert: {
                    "athlete_id": string,"competition"?: string | null,"created_at"?: string,"id"?: string,"position"?: number,"title": string,"year"?: number | null
                  }
                  Update: {
                    "athlete_id"?: string,"competition"?: string | null,"created_at"?: string,"id"?: string,"position"?: number,"title"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_achievements_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_clubs": {
                  Row: {
                    "athlete_id": string,"category": string | null,"club": string,"ended_on": string | null,"id": string,"started_on": string | null
                  }
                  Insert: {
                    "athlete_id": string,"category"?: string | null,"club": string,"ended_on"?: string | null,"id"?: string,"started_on"?: string | null
                  }
                  Update: {
                    "athlete_id"?: string,"category"?: string | null,"club"?: string,"ended_on"?: string | null,"id"?: string,"started_on"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_clubs_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_guardians": {
                  Row: {
                    "athlete_id": string,"created_at": string,"is_primary": boolean,"profile_id": string,"relation": Database["public"]['Enums']["guardian_relation"]
                  }
                  Insert: {
                    "athlete_id": string,"created_at"?: string,"is_primary"?: boolean,"profile_id": string,"relation"?: Database["public"]['Enums']["guardian_relation"]
                  }
                  Update: {
                    "athlete_id"?: string,"created_at"?: string,"is_primary"?: boolean,"profile_id"?: string,"relation"?: Database["public"]['Enums']["guardian_relation"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_guardians_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_guardians_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_media": {
                  Row: {
                    "athlete_id": string,"created_at": string,"description": string | null,"external_id": string | null,"focal_x": number,"focal_y": number,"height": number | null,"id": string,"is_primary": boolean,"kind": Database["public"]['Enums']["media_kind"],"position": number,"storage_path": string | null,"title": string | null,"url": string | null,"video_type": Database["public"]['Enums']["video_type"] | null,"width": number | null,"zoom": number
                  }
                  Insert: {
                    "athlete_id": string,"created_at"?: string,"description"?: string | null,"external_id"?: string | null,"focal_x"?: number,"focal_y"?: number,"height"?: number | null,"id"?: string,"is_primary"?: boolean,"kind": Database["public"]['Enums']["media_kind"],"position"?: number,"storage_path"?: string | null,"title"?: string | null,"url"?: string | null,"video_type"?: Database["public"]['Enums']["video_type"] | null,"width"?: number | null,"zoom"?: number
                  }
                  Update: {
                    "athlete_id"?: string,"created_at"?: string,"description"?: string | null,"external_id"?: string | null,"focal_x"?: number,"focal_y"?: number,"height"?: number | null,"id"?: string,"is_primary"?: boolean,"kind"?: Database["public"]['Enums']["media_kind"],"position"?: number,"storage_path"?: string | null,"title"?: string | null,"url"?: string | null,"video_type"?: Database["public"]['Enums']["video_type"] | null,"width"?: number | null,"zoom"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_media_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_org_blocks": {
                  Row: {
                    "athlete_id": string,"created_at": string,"created_by": string,"organization_id": string
                  }
                  Insert: {
                    "athlete_id": string,"created_at"?: string,"created_by"?: string,"organization_id": string
                  }
                  Update: {
                    "athlete_id"?: string,"created_at"?: string,"created_by"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_org_blocks_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_org_blocks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_org_blocks_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_views": {
                  Row: {
                    "athlete_id": string,"id": number,"kind": Database["public"]['Enums']["activity_kind"],"meta": NonNullable<Json>,"organization_id": string | null,"source": string | null,"viewed_at": string,"viewer_id": string
                  }
                  Insert: {
                    "athlete_id": string,"id"?: never,"kind"?: Database["public"]['Enums']["activity_kind"],"meta"?: NonNullable<Json>,"organization_id"?: string | null,"source"?: string | null,"viewed_at"?: string,"viewer_id": string
                  }
                  Update: {
                    "athlete_id"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["activity_kind"],"meta"?: NonNullable<Json>,"organization_id"?: string | null,"source"?: string | null,"viewed_at"?: string,"viewer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_views_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_views_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_views_viewer_id_fkey"
      columns: ["viewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"athletes": {
                  Row: {
                    "approved_at": string | null,"available": boolean | null,"bio": string | null,"birth_date": string,"birth_year": number | null,"category": string | null,"city": string | null,"competitions": (string)[],"country": string,"created_at": string,"current_club": string | null,"current_club_since": string | null,"experiences": string | null,"federated": boolean,"federation": string | null,"foot": Database["public"]['Enums']["dominant_foot"] | null,"full_name": string,"goals": string | null,"height_cm": number | null,"id": string,"measured_at": string | null,"nationality": (string)[],"primary_position": Database["public"]['Enums']["football_position"] | null,"relocate_abroad": Database["public"]['Enums']["availability_answer"] | null,"relocate_city": Database["public"]['Enums']["availability_answer"] | null,"relocate_state": Database["public"]['Enums']["availability_answer"] | null,"review_note": string | null,"reviewed_by": string | null,"secondary_positions": (Database["public"]['Enums']["football_position"])[],"seeking": (Database["public"]['Enums']["seeking_kind"])[],"sex": Database["public"]['Enums']["athlete_sex"] | null,"sport_name": string | null,"state": string | null,"status": Database["public"]['Enums']["athlete_status"],"submitted_at": string | null,"traits": (string)[],"travel": Database["public"]['Enums']["availability_answer"] | null,"updated_at": string,"visibility": Database["public"]['Enums']["profile_visibility"],"weight_kg": number | null
                  }
                  Insert: {
                    "approved_at"?: string | null,"available"?: boolean | null,"bio"?: string | null,"birth_date": string,"birth_year"?: never,"category"?: string | null,"city"?: string | null,"competitions"?: (string)[],"country": string,"created_at"?: string,"current_club"?: string | null,"current_club_since"?: string | null,"experiences"?: string | null,"federated"?: boolean,"federation"?: string | null,"foot"?: Database["public"]['Enums']["dominant_foot"] | null,"full_name": string,"goals"?: string | null,"height_cm"?: number | null,"id"?: string,"measured_at"?: string | null,"nationality"?: (string)[],"primary_position"?: Database["public"]['Enums']["football_position"] | null,"relocate_abroad"?: Database["public"]['Enums']["availability_answer"] | null,"relocate_city"?: Database["public"]['Enums']["availability_answer"] | null,"relocate_state"?: Database["public"]['Enums']["availability_answer"] | null,"review_note"?: string | null,"reviewed_by"?: string | null,"secondary_positions"?: (Database["public"]['Enums']["football_position"])[],"seeking"?: (Database["public"]['Enums']["seeking_kind"])[],"sex"?: Database["public"]['Enums']["athlete_sex"] | null,"sport_name"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["athlete_status"],"submitted_at"?: string | null,"traits"?: (string)[],"travel"?: Database["public"]['Enums']["availability_answer"] | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["profile_visibility"],"weight_kg"?: number | null
                  }
                  Update: {
                    "approved_at"?: string | null,"available"?: boolean | null,"bio"?: string | null,"birth_date"?: string,"birth_year"?: never,"category"?: string | null,"city"?: string | null,"competitions"?: (string)[],"country"?: string,"created_at"?: string,"current_club"?: string | null,"current_club_since"?: string | null,"experiences"?: string | null,"federated"?: boolean,"federation"?: string | null,"foot"?: Database["public"]['Enums']["dominant_foot"] | null,"full_name"?: string,"goals"?: string | null,"height_cm"?: number | null,"id"?: string,"measured_at"?: string | null,"nationality"?: (string)[],"primary_position"?: Database["public"]['Enums']["football_position"] | null,"relocate_abroad"?: Database["public"]['Enums']["availability_answer"] | null,"relocate_city"?: Database["public"]['Enums']["availability_answer"] | null,"relocate_state"?: Database["public"]['Enums']["availability_answer"] | null,"review_note"?: string | null,"reviewed_by"?: string | null,"secondary_positions"?: (Database["public"]['Enums']["football_position"])[],"seeking"?: (Database["public"]['Enums']["seeking_kind"])[],"sex"?: Database["public"]['Enums']["athlete_sex"] | null,"sport_name"?: string | null,"state"?: string | null,"status"?: Database["public"]['Enums']["athlete_status"],"submitted_at"?: string | null,"traits"?: (string)[],"travel"?: Database["public"]['Enums']["availability_answer"] | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["profile_visibility"],"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "athletes_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity": string,"entity_id": string | null,"id": number,"meta": NonNullable<Json>
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: never,"meta"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: never,"meta"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "athlete_id": string | null,"granted_at": string,"id": string,"ip": unknown,"kind": Database["public"]['Enums']["consent_kind"],"profile_id": string,"revoked_at": string | null,"user_agent": string | null,"version": string
                  }
                  Insert: {
                    "athlete_id"?: string | null,"granted_at"?: string,"id"?: string,"ip"?: unknown,"kind": Database["public"]['Enums']["consent_kind"],"profile_id": string,"revoked_at"?: string | null,"user_agent"?: string | null,"version": string
                  }
                  Update: {
                    "athlete_id"?: string | null,"granted_at"?: string,"id"?: string,"ip"?: unknown,"kind"?: Database["public"]['Enums']["consent_kind"],"profile_id"?: string,"revoked_at"?: string | null,"user_agent"?: string | null,"version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consents_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_requests": {
                  Row: {
                    "athlete_id": string,"created_at": string,"id": string,"message": string,"organization_id": string,"requested_by": string,"resolved_at": string | null,"status": Database["public"]['Enums']["contact_status"]
                  }
                  Insert: {
                    "athlete_id": string,"created_at"?: string,"id"?: string,"message": string,"organization_id": string,"requested_by": string,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["contact_status"]
                  }
                  Update: {
                    "athlete_id"?: string,"created_at"?: string,"id"?: string,"message"?: string,"organization_id"?: string,"requested_by"?: string,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["contact_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_requests_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"channel": Database["public"]['Enums']["notify_channel"],"id": string,"payload": NonNullable<Json>,"profile_id": string,"scheduled_at": string,"sent_at": string | null,"status": string,"template": string
                  }
                  Insert: {
                    "attempts"?: number,"channel": Database["public"]['Enums']["notify_channel"],"id"?: string,"payload"?: NonNullable<Json>,"profile_id": string,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: string,"template": string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["notify_channel"],"id"?: string,"payload"?: NonNullable<Json>,"profile_id"?: string,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: string,"template"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "is_owner": boolean,"organization_id": string,"profile_id": string
                  }
                  Insert: {
                    "is_owner"?: boolean,"organization_id": string,"profile_id": string
                  }
                  Update: {
                    "is_owner"?: boolean,"organization_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "country": string,"created_at": string,"document": string | null,"id": string,"kind": Database["public"]['Enums']["pro_org_kind"],"name": string,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["review_status"],"website": string | null
                  }
                  Insert: {
                    "country": string,"created_at"?: string,"document"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["pro_org_kind"],"name": string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_status"],"website"?: string | null
                  }
                  Update: {
                    "country"?: string,"created_at"?: string,"document"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["pro_org_kind"],"name"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["review_status"],"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"athlete_id": string,"created_at": string,"currency": string,"id": string,"paid_at": string | null,"payer_id": string,"provider": string | null,"provider_ref": string | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  Insert: {
                    "amount_cents"?: number,"athlete_id": string,"created_at"?: string,"currency"?: string,"id"?: string,"paid_at"?: string | null,"payer_id": string,"provider"?: string | null,"provider_ref"?: string | null,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Update: {
                    "amount_cents"?: number,"athlete_id"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"paid_at"?: string | null,"payer_id"?: string,"provider"?: string | null,"provider_ref"?: string | null,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pro_favorites": {
                  Row: {
                    "athlete_id": string,"created_at": string,"profile_id": string
                  }
                  Insert: {
                    "athlete_id": string,"created_at"?: string,"profile_id": string
                  }
                  Update: {
                    "athlete_id"?: string,"created_at"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pro_favorites_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pro_favorites_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pro_list_items": {
                  Row: {
                    "added_at": string,"added_by": string,"athlete_id": string,"list_id": string
                  }
                  Insert: {
                    "added_at"?: string,"added_by": string,"athlete_id": string,"list_id": string
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string,"athlete_id"?: string,"list_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pro_list_items_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pro_list_items_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pro_list_items_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "pro_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"pro_lists": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"name": string,"organization_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"name": string,"organization_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pro_lists_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pro_lists_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"pro_notes": {
                  Row: {
                    "athlete_id": string,"author_id": string,"body": string,"created_at": string,"id": string,"organization_id": string,"tags": (string)[]
                  }
                  Insert: {
                    "athlete_id": string,"author_id": string,"body": string,"created_at"?: string,"id"?: string,"organization_id": string,"tags"?: (string)[]
                  }
                  Update: {
                    "athlete_id"?: string,"author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"organization_id"?: string,"tags"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "pro_notes_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pro_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pro_notes_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "country": string,"created_at": string,"document": string | null,"email": string,"email_verified_at": string | null,"full_name": string,"id": string,"locale": string,"phone": string | null,"phone_verified_at": string | null,"role": Database["public"]['Enums']["app_role"],"updated_at": string,"whatsapp": string | null
                  }
                  Insert: {
                    "country"?: string,"created_at"?: string,"document"?: string | null,"email": string,"email_verified_at"?: string | null,"full_name": string,"id": string,"locale"?: string,"phone"?: string | null,"phone_verified_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Update: {
                    "country"?: string,"created_at"?: string,"document"?: string | null,"email"?: string,"email_verified_at"?: string | null,"full_name"?: string,"id"?: string,"locale"?: string,"phone"?: string | null,"phone_verified_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"scout_evaluations": {
                  Row: {
                    "athlete_id": string,"author_id": string,"created_at": string,"id": string,"mental": number | null,"observation": string | null,"organization_id": string,"physical": number | null,"potential": number | null,"tactical": number | null,"technical": number | null
                  }
                  Insert: {
                    "athlete_id": string,"author_id": string,"created_at"?: string,"id"?: string,"mental"?: number | null,"observation"?: string | null,"organization_id": string,"physical"?: number | null,"potential"?: number | null,"tactical"?: number | null,"technical"?: number | null
                  }
                  Update: {
                    "athlete_id"?: string,"author_id"?: string,"created_at"?: string,"id"?: string,"mental"?: number | null,"observation"?: string | null,"organization_id"?: string,"physical"?: number | null,"potential"?: number | null,"tactical"?: number | null,"technical"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "scout_evaluations_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scout_evaluations_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scout_evaluations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "athlete_activity_signals":
{ Args: { "p_athlete": string }; Returns: {
              "kind": Database["public"]['Enums']["activity_kind"],"last_at": string
            }[]
                           },
"athlete_blocked_organizations":
{ Args: { "p_athlete": string }; Returns: {
              "blocked_at": string,"country": string,"id": string,"kind": Database["public"]['Enums']["pro_org_kind"],"name": string
            }[]
                           },
"athlete_trait_keys":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"athlete_visible_to_pro":
{ Args: { "p_athlete": string }; Returns: boolean
                           },
"auth_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"create_athlete":
{ Args: { "p_birth_date": string,"p_country": string,"p_full_name": string,"p_relation"?: Database["public"]['Enums']["guardian_relation"],"p_sport_name": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_approved_pro":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_my_athlete":
{ Args: { "p_athlete": string }; Returns: boolean
                           },
"is_privileged":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_payment_paid":
{ Args: { "p_payment": string,"p_provider": string,"p_provider_ref": string }; Returns: undefined
                           },
"my_approved_orgs":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_athlete_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"search_organizations":
{ Args: { "p_query": string }; Returns: {
              "country": string,"id": string,"kind": Database["public"]['Enums']["pro_org_kind"],"name": string
            }[]
                           },
"set_primary_photo":
{ Args: { "p_media": string }; Returns: undefined
                           },
"storage_athlete_id":
{ Args: { "p_name": string }; Returns: string
                           }
          }
          Enums: {
            "activity_kind": "view"|"search_appearance"|"interest","app_role": "RESPONSIBLE"|"PROFESSIONAL"|"SCOUT"|"ADMIN","athlete_sex": "male"|"female","athlete_status": "draft"|"pending_payment"|"in_review"|"approved"|"rejected"|"suspended","availability_answer": "yes"|"no"|"open","consent_kind": "terms"|"privacy"|"guardian_declaration"|"pro_visibility"|"no_guarantee"|"marketing_whatsapp","contact_status": "requested"|"forwarded"|"accepted"|"declined"|"expired","dominant_foot": "right"|"left"|"both","football_position": "GK"|"RB"|"CB"|"LB"|"DM"|"CM"|"AM"|"RW"|"LW"|"CF"|"ST","guardian_relation": "mother"|"father"|"legal_guardian"|"self"|"other","media_kind": "photo"|"youtube"|"video_link","notify_channel": "email"|"whatsapp"|"sms","payment_status": "pending"|"paid"|"failed"|"refunded","pro_org_kind": "club"|"scout"|"agent"|"company"|"scouting_hub"|"brand","profile_visibility": "active"|"paused"|"hidden","review_status": "pending"|"approved"|"rejected"|"suspended","seeking_kind": "club"|"representation"|"agent"|"sponsorship"|"evaluation"|"other"|"national_opportunity"|"international_opportunity","video_type": "highlights"|"full_match"|"training"|"goal_play"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "activity_kind": ["view", "search_appearance", "interest"],"app_role": ["RESPONSIBLE", "PROFESSIONAL", "SCOUT", "ADMIN"],"athlete_sex": ["male", "female"],"athlete_status": ["draft", "pending_payment", "in_review", "approved", "rejected", "suspended"],"availability_answer": ["yes", "no", "open"],"consent_kind": ["terms", "privacy", "guardian_declaration", "pro_visibility", "no_guarantee", "marketing_whatsapp"],"contact_status": ["requested", "forwarded", "accepted", "declined", "expired"],"dominant_foot": ["right", "left", "both"],"football_position": ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "CF", "ST"],"guardian_relation": ["mother", "father", "legal_guardian", "self", "other"],"media_kind": ["photo", "youtube", "video_link"],"notify_channel": ["email", "whatsapp", "sms"],"payment_status": ["pending", "paid", "failed", "refunded"],"pro_org_kind": ["club", "scout", "agent", "company", "scouting_hub", "brand"],"profile_visibility": ["active", "paused", "hidden"],"review_status": ["pending", "approved", "rejected", "suspended"],"seeking_kind": ["club", "representation", "agent", "sponsorship", "evaluation", "other", "national_opportunity", "international_opportunity"],"video_type": ["highlights", "full_match", "training", "goal_play", "other"]
          }
        }
} as const
