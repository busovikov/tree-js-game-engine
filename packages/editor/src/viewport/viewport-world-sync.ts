interface DetachableGizmo {
  detach(): void
  getHelper(): { visible: boolean }
}

export function detachGizmoBeforeWorldSync(gizmo: DetachableGizmo | null): void {
  if (!gizmo) return
  gizmo.detach()
  gizmo.getHelper().visible = false
}
