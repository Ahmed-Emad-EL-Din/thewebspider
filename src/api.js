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
