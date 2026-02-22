export async function fetchMonitorsApi(email) {
    const response = await fetch(`/.netlify/functions/get-monitors?email=${encodeURIComponent(email)}`);
    if (!response.ok) throw new Error('Failed to fetch monitors');
    return await response.json();
}

export async function deleteMonitorApi(id, email) {
    const response = await fetch(`/.netlify/functions/delete-monitor?id=${id}&email=${encodeURIComponent(email)}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete monitor');
    return true;
}

export async function addMonitorApi(formData) {
    const response = await fetch('/.netlify/functions/add-monitor', {
        method: 'POST',
        body: JSON.stringify(formData)
    });

    // add-monitor returns 403 on limit, etc. We must parse json to get error message.
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Failed to add monitor');
    }
    return result;
}

export async function editMonitorApi(formData) {
    const response = await fetch('/.netlify/functions/edit-monitor', {
        method: 'PUT',
        body: JSON.stringify(formData)
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Failed to update monitor');
    }
    return result;
}

export async function checkAdminApi(email) {
    const response = await fetch(`/.netlify/functions/check-admin?email=${encodeURIComponent(email)}`);
    if (!response.ok) return false;
    const data = await response.json();
    return !!data.is_admin;
}

export async function getAdminStatsApi(email) {
    const response = await fetch(`/.netlify/functions/admin-stats?email=${encodeURIComponent(email)}`);
    if (!response.ok) throw new Error('Unauthorized or failed to fetch stats');
    return await response.json();
}

export async function toggleMonitorApi(adminEmail, id, isPaused) {
    const response = await fetch('/.netlify/functions/toggle-monitor', {
        method: 'POST',
        body: JSON.stringify({ admin_email: adminEmail, id, is_paused: isPaused })
    });
    if (!response.ok) throw new Error('Failed to toggle monitor state');
    return await response.json();
}
