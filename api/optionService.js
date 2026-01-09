const optionService = {
  async getEffectiveOptionGroupsForProduct(db, tenantId, productId) {
    const [catRows] = await db.query(
      `SELECT category_id FROM prod_product_categories WHERE tenant_id=? AND product_id=?`,
      [tenantId, productId]
    );
    const categoryIds = catRows.map(r => Number(r.category_id)).filter(Number.isFinite);

    const assignmentParams = [tenantId, productId];
    let assignmentSql = `SELECT * FROM prod_option_assignments WHERE tenant_id=? AND is_active=1 AND (assign_type='product' AND assign_id=?)`;

    if (categoryIds.length) {
      assignmentSql += ` OR (assign_type='category' AND assign_id IN (${categoryIds.map(() => '?').join(',')}))`;
      assignmentParams.push(...categoryIds);
    }

    const [assignments] = await db.query(assignmentSql, assignmentParams);
    const winners = new Map();

    assignments.forEach((a) => {
      const gid = Number(a.group_id);
      if (!Number.isFinite(gid)) return;
      const current = winners.get(gid);
      const typeWeight = a.assign_type === 'product' ? 2 : 1;
      const priority = Number(a.priority || 0);
      const sortOrder = Number(a.sort_order || 0);

      if (!current) {
        winners.set(gid, { assignment: a, typeWeight, priority, sortOrder });
        return;
      }

      if (typeWeight !== current.typeWeight) {
        if (typeWeight > current.typeWeight) winners.set(gid, { assignment: a, typeWeight, priority, sortOrder });
        return;
      }

      if (priority !== current.priority) {
        if (priority > current.priority) winners.set(gid, { assignment: a, typeWeight, priority, sortOrder });
        return;
      }

      if (sortOrder !== current.sortOrder) {
        if (sortOrder < current.sortOrder) winners.set(gid, { assignment: a, typeWeight, priority, sortOrder });
        return;
      }
    });

    let groupIds = Array.from(winners.keys());
    if (!groupIds.length) return [];

    const [exclusions] = await db.query(
      `SELECT group_id FROM prod_option_exclusions WHERE tenant_id=? AND product_id=?`,
      [tenantId, productId]
    );
    const excluded = new Set(exclusions.map(r => Number(r.group_id)).filter(Number.isFinite));
    groupIds = groupIds.filter(id => !excluded.has(id));
    if (!groupIds.length) return [];

    const [overrides] = await db.query(
      `SELECT * FROM prod_option_overrides WHERE tenant_id=? AND product_id=?`,
      [tenantId, productId]
    );
    const overrideMap = new Map(overrides.map(o => [Number(o.group_id), o]));

    const [groups] = await db.query(
      `SELECT * FROM prod_option_groups WHERE tenant_id=? AND is_active=1 AND id IN (${groupIds.map(() => '?').join(',')})`,
      [tenantId, ...groupIds]
    );
    const groupMap = new Map(groups.map(g => [Number(g.id), g]));

    const [items] = await db.query(
      `SELECT * FROM prod_option_items WHERE tenant_id=? AND is_active=1 AND group_id IN (${groupIds.map(() => '?').join(',')}) ORDER BY sort_order ASC, id ASC`,
      [tenantId, ...groupIds]
    );

    const itemsByGroup = new Map();
    items.forEach((item) => {
      const gid = Number(item.group_id);
      if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
      itemsByGroup.get(gid).push(item);
    });

    const result = [];
    groupIds.forEach((gid) => {
      const base = groupMap.get(gid);
      if (!base) return;
      const override = overrideMap.get(gid);
      const assignment = winners.get(gid)?.assignment || null;

      const group = {
        ...base,
        selection_type: override?.selection_type ?? base.selection_type,
        min_select: override?.min_select ?? base.min_select,
        max_select: override?.max_select ?? base.max_select,
        sort_order: override?.sort_order ?? base.sort_order,
        assignment_sort_order: assignment?.sort_order ?? null,
        items: itemsByGroup.get(gid) || [],
      };

      result.push(group);
    });

    result.sort((a, b) => {
      const ao = Number(a.assignment_sort_order ?? a.sort_order ?? 0);
      const bo = Number(b.assignment_sort_order ?? b.sort_order ?? 0);
      if (ao !== bo) return ao - bo;
      return Number(a.id) - Number(b.id);
    });

    return result;
  }
};

module.exports = optionService;
