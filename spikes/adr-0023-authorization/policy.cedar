// Illustrative Drawloom test policy, not a NIST-prescribed classification scheme.
permit(principal, action, resource)
when {
  principal.active && resource.active &&
  principal.tenant == resource.tenant &&
  principal.clearance >= resource.sensitivity &&
  principal.compartments.containsAll(resource.compartments) &&
  context.now < resource.expires &&
  (action == Action::"read" || action == Action::"derive" ||
   (action == Action::"export_model" && resource.remoteAllowed))
};
