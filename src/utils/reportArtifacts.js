function getStructuredReportKey(caseId) {
  return `reports/${caseId}/structured-report.json`;
}

module.exports = { getStructuredReportKey };
