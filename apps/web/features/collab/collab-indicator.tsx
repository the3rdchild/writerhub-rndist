'use client'

import { useCollab } from './collab-context'
import { CollabNotices, CollabStatus } from './collab-status'

/** Keadaan sunting-bersama tab aktif di bilah atas aplikasi. */
export function CollabIndicator() {
	const { phase, role, collaborators, notices, dismissNotice } = useCollab()
	return (
		<>
			<CollabStatus phase={phase} role={role} collaborators={collaborators} />
			<CollabNotices notices={notices} onDismiss={dismissNotice} />
		</>
	)
}
