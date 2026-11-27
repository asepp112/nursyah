# Security Specification — SIM-PPSI Aliran Nursyah

## 1. Data Invariants
1. **Master Organization Scope (Public Directory & Shared Media)**: Shared non-PII organizational collections (`regions`, `belt_levels`, `members`, `broadcasts`, `letters`, `documentation`) carry `orgCode == "NURSYAH"` and allow public `get`/`list` scoped to `resource.data.orgCode == "NURSYAH"` so everyone can view member names, full addresses (`alamatLengkap`), belt levels (`sabuk`), documentation/memories, and announcements.
2. **Zero-Gate Self-Service Registration & Belt History (`members` Create & Mandiri Promotion)**: Anyone can submit their own new member profile (`create` on `/members/{memberId}`) without needing prior login (`ownerUid == 'mandiri'`, bounded `riwayatTingkat.size() <= 25`, optional 4-digit `tahunDilantikPutih`, strict `isValidMember` schema, `createdAt == request.time`, `updatedAt == request.time`). Self-service promotion updates on `ownerUid == 'mandiri'` are strictly restricted to append-only belt fields (`sabuk`, `sabukOrder`, `riwayatTingkat`, `tahunDilantikPutih`, `updatedAt`, and `nia` only when graduating from `Sabuk Kuning Mas` to `sabukOrder >= 2`).
3. **Collaborative Verified Writes**: Verified authenticated users (`request.auth != null && request.auth.token.email_verified == true`) can update member records, upload documentation/memories (`documentation`), create letters (`letters`), and send announcements (`broadcasts`) within strict schema & size bounds.
4. **Admin Pusat Authority & Revocable Root Admin**: Verified Admin Pusat (`fadliyuliansyah733@gmail.com` while `/admin_config/root` does not exist, UID in `/admins/{uid}`, or email in `/admin_emails/{email}`) can create/update/delete `regions`, `belt_levels`, `admin_vault`, `backups`, `admin_emails`, `admin_config`, or `admins`. Creating `/admin_config/root` revokes `fadliyuliansyah733@gmail.com` root privileges immediately.
5. **PII Isolation & Atomic Self-Registration Guarantee**: Sensitive member PII (`nomorWa`, `tempatLahir`, `tanggalLahir`, `alamatDomisili`, `berkasDataUrl`) remains isolated in `/members/{memberId}/private/pii`. Reading PII (`get`) is strictly restricted to the verified owner or Admin Pusat (`list` is disabled). Unauthenticated PII `create` is ONLY allowed atomically alongside a brand-new `mandiri` member creation (`!exists(member) && existsAfter(member) && getAfter(member).data.ownerUid == 'mandiri'`), preventing any overwrite or tampering of existing members' PII.
6. **Temporal & Ownership Integrity**: Every `createdAt` must equal `request.time` on creation and remain immutable on update.
7. **Bounded Payload & Path Hardening**: Every document ID matches `^[a-zA-Z0-9_\-]+$` (`<= 128` chars) and every string/array field enforces strict `.size()` bounds.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unverified Email Spoof**: User with `email: "fadliyuliansyah733@gmail.com"` and `email_verified: false` attempts to write `/regions/prov-jabar`.
2. **Non-Admin Region Tamper**: Regular verified user attempts to create `/regions/ranting-palsu`.
3. **Non-Admin Vault Access**: Regular verified user attempts to `get` or `list` `/admin_vault`.
4. **Shadow Field Injection on Member Create**: Client creates `/members/m1` with extra ghost field `isSuperAdmin: true`.
5. **Self-Privilege Escalation**: Regular verified user attempts to write `/admins/{uid}` to promote themselves.
6. **PII Scraping Attack**: Unauthenticated or non-owner verified user attempts `get` or `list` on `/members/m1/private/pii`.
7. **Owner Spoofing / Invalid Year on Member Create**: Unauthenticated client creates `/members/m2` setting `ownerUid: "user-B"` or malformed `tahunDilantikPutih: "abcd"`.
8. **Immutable CreatedAt Tampering**: User updates `/members/m1` attempting to alter `createdAt` or `ownerUid`.
9. **Client Timestamp Forgery**: User creates `/broadcasts/b1` or `/members/m1` with backdated `createdAt` instead of `request.time`.
10. **ID Poisoning / Denial of Wallet**: User attempts write to `/members/` with a 500-character invalid document ID containing spaces/slashes.
11. **Unbounded Array / Payload Exhaustion**: User submits `/members/m3` with `riwayatTingkat` containing > 25 items or `namaLengkap` > 120 chars.
12. **Unauthenticated Profile Tamper / Delete / PII Overwrite**: Unauthenticated client attempts `delete` on `/members/m1`, attempts to overwrite `namaLengkap`/`alamatLengkap` via `update`, or creates `/members/m1/private/pii` for an already existing member.
