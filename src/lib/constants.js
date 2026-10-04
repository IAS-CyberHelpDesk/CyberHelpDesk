export const INCIDENT_TYPES = ['Phishing', 'Malware', 'Suspicious Link', 'Unauthorized Access', 'Compromised Account', 'Other']
export const SEVERITIES = ['low', 'medium', 'high']
export const CHANNELS = ['Bank Transfer', 'GCash', 'Maya', 'PayPal', 'Check', 'Cash']
export const DUAL_APPROVAL_THRESHOLD = 50000

export const CHART_TYPES = ['Phishing', 'Suspicious Link', 'Malware', 'Unauthorized Access', 'Compromised Account']
export const CHART_COLORS = {
  Phishing: '#2563EB',
  'Suspicious Link': '#06B6D4',
  Malware: '#7C3AED',
  'Unauthorized Access': '#F59E0B',
  'Compromised Account': '#DC2626',
}
export const CHART_SHORT = {
  Phishing: 'Phishing',
  'Suspicious Link': 'Susp. Link',
  Malware: 'Malware',
  'Unauthorized Access': 'Unauthorized',
  'Compromised Account': 'Compromised',
}

export const CANNED_REPLIES = [
  'Thanks for reporting this. We are looking into it now and will update you shortly.',
  'Please do not click any links or open attachments in that message while we investigate.',
  'Could you send the original email as an attachment (not a forward or screenshot)?',
  'We have contained the issue. Please reset the affected passwords and let us know if anything looks unusual.',
]

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPTED_FILES = '.png,.jpg,.jpeg,.pdf,.txt,.eml'
