let COMPLIANCE_DATA_3220 = null;
let CLASSIFICATION_DATA_3296 = null;
const STAR_KEYS = ['1', '2', '3', '4', '5'];

function normalizeMandatoryValue(value) {
    return value === true;
}

function normalizeMandatoryKey(rawKey) {
    const key = String(rawKey || '').trim().toLowerCase();
    const starKeyMatch = key.match(/^([1-5])(?:_star)?$/);
    if (starKeyMatch) return starKeyMatch[1];
    if (/^\*{1,5}$/.test(key)) return String(key.length);
    return null;
}

function createEmptyMandatoryMap() {
    return { '1': false, '2': false, '3': false, '4': false, '5': false };
}

function normalizeMandatoryObject(rawMandatory) {
    const normalized = createEmptyMandatoryMap();
    if (!rawMandatory || typeof rawMandatory !== 'object') return normalized;

    Object.entries(rawMandatory).forEach(([rawKey, rawValue]) => {
        const starKey = normalizeMandatoryKey(rawKey);
        if (!starKey) return;
        normalized[starKey] = normalizeMandatoryValue(rawValue);
    });

    return normalized;
}

function normalizeOptionalObject(rawOptional) {
    const normalized = createEmptyMandatoryMap();
    if (!rawOptional || typeof rawOptional !== 'object') return normalized;

    Object.entries(rawOptional).forEach(([rawKey, rawValue]) => {
        const starKey = normalizeMandatoryKey(rawKey);
        if (!starKey) return;
        normalized[starKey] = normalizeMandatoryValue(rawValue);
    });

    return normalized;
}

function buildOptionalObject(mandatory) {
    const optional = createEmptyMandatoryMap();
    STAR_KEYS.forEach(starKey => {
        optional[starKey] = mandatory[starKey] !== true;
    });
    return optional;
}

function normalizeReferenceCodes(rawReference) {
    if (!rawReference) return [];
    const normalized = String(rawReference)
        .replaceAll('А', 'A')
        .replaceAll('а', 'a');

    const parts = normalized
        .split(/[,\s;]+/)
        .map(part => part.trim())
        .filter(Boolean);

    const codes = parts
        .map(part => part.toUpperCase().replace(/[^A-Z0-9]/g, ''))
        .filter(part => /^A\d+$/.test(part));

    return Array.from(new Set(codes));
}

function normalizeQuantityValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.floor(numeric);
}

function normalizeQuantityMap(rawMap) {
    const normalized = {};
    if (!rawMap || typeof rawMap !== 'object') return normalized;
    Object.entries(rawMap).forEach(([id, value]) => {
        const quantity = normalizeQuantityValue(value);
        if (quantity > 0) {
            normalized[String(id)] = quantity;
        }
    });
    return normalized;
}

function normalizeScoringRule(rawRule, fallbackMaxPoints) {
    if (!rawRule || typeof rawRule !== 'object') return null;
    if (rawRule.type !== 'per_unit') return null;

    const pointsPerUnit = Number(rawRule.points_per_unit);
    const maxPoints = Number(rawRule.max_points ?? fallbackMaxPoints);
    if (!Number.isFinite(pointsPerUnit) || pointsPerUnit <= 0) return null;
    if (!Number.isFinite(maxPoints) || maxPoints < 0) return null;

    return {
        type: 'per_unit',
        pointsPerUnit,
        maxPoints,
        unit: {
            uz: rawRule.unit_uz || '',
            ru: rawRule.unit_ru || '',
            en: rawRule.unit_en || ''
        }
    };
}

function normalizeComplianceData(rawData) {
    if (!rawData || typeof rawData !== 'object') {
        throw new Error('Invalid compliance dataset');
    }

    // Current app-native shape
    if (Array.isArray(rawData.sections) && rawData.sections[0]?.requirements) {
        if (rawData.facilityTypes && typeof rawData.facilityTypes === 'object') {
            return rawData;
        }
        return {
            ...rawData,
            facilityTypes: {
                hotels_and_similar: {
                    uz: "Mehmonxonalar va shunga o'xshash joylashtirish vositalari",
                    ru: 'Гостиницы и аналогичные средства размещения',
                    en: 'Hotels and similar accommodation facilities'
                }
            },
            defaultFacilityType: 'hotels_and_similar'
        };
    }

    // New shape:
    // { facility_types, sections:[{section_id, name_*, items:[...]}] }
    if (!Array.isArray(rawData.sections)) {
        throw new Error('Unsupported compliance dataset format');
    }

    const facilityTypes = {};
    const sourceTypes = rawData.facility_types && typeof rawData.facility_types === 'object'
        ? rawData.facility_types
        : {};
    Object.entries(sourceTypes).forEach(([key, value]) => {
        facilityTypes[key] = {
            uz: value?.uz || key,
            ru: value?.ru || key,
            en: value?.en || key
        };
    });
    if (!Object.keys(facilityTypes).length) {
        facilityTypes.hotels_and_similar = {
            uz: "Mehmonxonalar va shunga o'xshash joylashtirish vositalari",
            ru: 'Гостиницы и аналогичные средства размещения',
            en: 'Hotels and similar accommodation facilities'
        };
    }
    const defaultFacilityType = facilityTypes.hotels_and_similar
        ? 'hotels_and_similar'
        : Object.keys(facilityTypes)[0];

    const sections = rawData.sections.map(section => {
        const rawItems = Array.isArray(section.items) ? section.items : [];
        const requirements = rawItems
            .filter(item => (item.type || 'requirement') === 'requirement')
            .map(item => {
                const applicability = item.applicability && typeof item.applicability === 'object'
                    ? item.applicability
                    : null;
                return {
                    id: String(item.id),
                    title: {
                        uz: item.criterion_uz || item.name_uz || '',
                        ru: item.criterion_ru || item.name_ru || '',
                        en: item.criterion_en || item.name_en || ''
                    },
                    mandatory: applicability
                        ? applicability[defaultFacilityType] === '+'
                        : true,
                    applicability,
                    notes: item.notes || ''
                };
            });

        return {
            id: String(section.section_id || section.id || ''),
            name: {
                uz: section.name_uz || '',
                ru: section.name_ru || '',
                en: section.name_en || ''
            },
            requirements
        };
    });

    return {
        standard: rawData.standard || "O'z DSt 3220:2023",
        title_uz: rawData.title_uz || '',
        title_ru: rawData.title_ru || '',
        title_en: rawData.title_en || '',
        sections,
        facilityTypes,
        defaultFacilityType,
        applicabilityLegend: rawData.applicability_legend || null
    };
}

function normalizeClassificationData(rawData) {
    if (!rawData || typeof rawData !== 'object') {
        throw new Error('Invalid classification dataset');
    }

    // Current app-native shape
    if (Array.isArray(rawData.sections) && Array.isArray(rawData.starLevels)) {
        const mandatoryById = new Map();
        (rawData.starLevels || []).forEach(level => {
            const star = String(Number(level.star));
            if (!/^[1-5]$/.test(star)) return;
            (level.mandatoryIds || []).forEach(rawId => {
                const id = String(rawId);
                if (!mandatoryById.has(id)) mandatoryById.set(id, createEmptyMandatoryMap());
                mandatoryById.get(id)[star] = true;
            });
        });

        const sections = (rawData.sections || []).map(section => {
            const sectionReferenceCodes = normalizeReferenceCodes(section.reference || section.references || '');
            return {
                ...section,
                criteria: (section.criteria || []).map(item => {
                    const id = String(item.id);
                    const derivedMandatory = mandatoryById.get(id);
                    const mergedMandatory = normalizeMandatoryObject(item.mandatory || derivedMandatory || {});
                    const strictOptional = normalizeOptionalObject(item.optional || {});
                    const mergedOptional = buildOptionalObject(mergedMandatory);
                    STAR_KEYS.forEach(starKey => {
                        if (mergedMandatory[starKey] === true) {
                            mergedOptional[starKey] = false;
                        } else if (strictOptional[starKey] === true) {
                            mergedOptional[starKey] = true;
                        }
                    });
                    const isGroupHeader = Boolean(item.isGroupHeader || item.is_group_header);
                    const referenceCodes = Array.from(new Set([
                        ...sectionReferenceCodes,
                        ...normalizeReferenceCodes(item.reference || item.references || '')
                    ]));
                    const rawMaxPoints = Number(item.max_points);
                    const scoringRule = normalizeScoringRule(item.scoring_rule || item.scoringRule, rawMaxPoints);
                    const maxPoints = Number.isFinite(rawMaxPoints) && rawMaxPoints >= 0
                        ? rawMaxPoints
                        : (scoringRule ? scoringRule.maxPoints : (Number(item.points) || 0));
                    return {
                        ...item,
                        id,
                        points: Number(item.points) || 0,
                        maxPoints,
                        scoringRule,
                        mandatory: mergedMandatory,
                        optional: mergedOptional,
                        referenceCodes,
                        assessable: typeof item.assessable === 'boolean' ? item.assessable : !isGroupHeader,
                        isGroupHeader
                    };
                })
            };
        });

        const starLevels = (rawData.starLevels || []).map(level => {
            const star = Number(level.star);
            const starKey = String(star);
            const mandatoryIds = [];
            sections.forEach(section => {
                (section.criteria || []).forEach(criterion => {
                    if (!criterion.assessable) return;
                    if (criterion.mandatory && criterion.mandatory[starKey] === true) {
                        mandatoryIds.push(String(criterion.id));
                    }
                });
            });

            return {
                ...level,
                star,
                label: level.label || '★'.repeat(star),
                minTotalPoints: Number(level.minTotalPoints) || 0,
                mandatoryIds: Array.from(new Set(mandatoryIds))
            };
        });

        let accommodationTypes = rawData.accommodationTypes && typeof rawData.accommodationTypes === 'object'
            ? rawData.accommodationTypes
            : null;
        let defaultAccommodationType = rawData.defaultAccommodationType || null;

        if (!accommodationTypes) {
            const defaultTypeKey = 'hotels_and_similar';
            const defaultType = {
                key: defaultTypeKey,
                name: {
                    uz: "Mehmonxonalar va o'xshash joylashtirish vositalari",
                    ru: 'Гостиницы и аналогичные средства размещения',
                    en: 'Hotels and similar accommodation facilities'
                },
                minScores: {}
            };
            starLevels.forEach(level => {
                defaultType.minScores[Number(level.star)] = Number(level.minTotalPoints) || 0;
            });
            accommodationTypes = { [defaultTypeKey]: defaultType };
            defaultAccommodationType = defaultTypeKey;
        }

        return {
            ...rawData,
            sections,
            starLevels,
            accommodationTypes,
            defaultAccommodationType: defaultAccommodationType || Object.keys(accommodationTypes)[0]
        };
    }

    // New shape provided by user:
    // { categories: [...], minimum_scores: {...}, max_points: ... }
    if (!Array.isArray(rawData.categories)) {
        throw new Error('Unsupported classification dataset format');
    }

    const categories = rawData.categories;
    const minimumScores = rawData.minimum_scores && typeof rawData.minimum_scores === 'object'
        ? rawData.minimum_scores
        : {};
    const accommodationTypes = {};
    Object.entries(minimumScores).forEach(([key, config]) => {
        if (!config || typeof config !== 'object') return;
        accommodationTypes[key] = {
            key,
            name: {
                uz: config.name_uz || key,
                ru: config.name_ru || key,
                en: config.name_en || key
            },
            minScores: {
                1: Number(config['1_star']) || 0,
                2: Number(config['2_star']) || 0,
                3: Number(config['3_star']) || 0,
                4: Number(config['4_star']) || 0,
                5: Number(config['5_star']) || 0
            }
        };
    });
    const defaultAccommodationType = accommodationTypes.hotels_and_similar
        ? 'hotels_and_similar'
        : (Object.keys(accommodationTypes)[0] || 'hotels_and_similar');
    const defaultMinimumScores = accommodationTypes[defaultAccommodationType]?.minScores || {};

    const sections = categories.map(category => {
        const sectionReferenceCodes = normalizeReferenceCodes(category.reference || '');
        return {
            id: category.id,
            name: {
                uz: category.name_uz || '',
                ru: category.name_ru || '',
                en: category.name_en || ''
            },
            criteria: (category.items || []).map(item => {
                const mandatory = normalizeMandatoryObject(item.mandatory || {});
                const referenceCodes = Array.from(new Set([
                    ...sectionReferenceCodes,
                    ...normalizeReferenceCodes(item.reference || '')
                ]));
                const rawMaxPoints = Number(item.max_points);
                const scoringRule = normalizeScoringRule(item.scoring_rule, rawMaxPoints);
                const maxPoints = Number.isFinite(rawMaxPoints) && rawMaxPoints >= 0
                    ? rawMaxPoints
                    : (scoringRule ? scoringRule.maxPoints : (Number(item.points) || 0));
                return {
                    id: String(item.id),
                    title: {
                        uz: item.criterion_uz || '',
                        ru: item.criterion_ru || '',
                        en: item.criterion_en || ''
                    },
                    points: Number(item.points) || 0,
                    maxPoints,
                    scoringRule,
                    reference: item.reference || '',
                    referenceCodes,
                    mandatory,
                    optional: buildOptionalObject(mandatory),
                    assessable: !Boolean(item.is_group_header),
                    isGroupHeader: Boolean(item.is_group_header)
                };
            })
        };
    });

    const starLevels = [1, 2, 3, 4, 5].map(star => {
        const starKey = String(star);
        const mandatoryIds = [];
        sections.forEach(section => {
            (section.criteria || []).forEach(criterion => {
                if (!criterion.assessable) return;
                if (criterion.mandatory && criterion.mandatory[starKey] === true) {
                    mandatoryIds.push(String(criterion.id));
                }
            });
        });

        return {
            star,
            label: '★'.repeat(star),
            minTotalPoints: Number(defaultMinimumScores[star]) || 0,
            mandatoryIds: Array.from(new Set(mandatoryIds))
        };
    });

    const totalPoints = sections.reduce((sum, section) => {
        return sum + section.criteria.reduce((inner, criterion) => {
            if (!isAssessableClassificationCriterion(criterion)) return inner;
            return inner + (Number(criterion.maxPoints) || Number(criterion.points) || 0);
        }, 0);
    }, 0);

    return {
        standard: rawData.standard || 'MST 125',
        maxPoints: Number(rawData.max_points) || totalPoints,
        starLevels,
        sections,
        annotations: Array.isArray(rawData.annotations) ? rawData.annotations : [],
        accommodationTypes,
        defaultAccommodationType
    };
}

async function loadData() {
    try {
        const [complianceRes, classificationRes] = await Promise.all([
            fetch('data/3220_annex_a.json'),
            fetch('data/3296_star_classification.json')
        ]);
        if (!complianceRes.ok || !classificationRes.ok) {
            throw new Error('Failed to load data');
        }
        const complianceRawData = await complianceRes.json();
        COMPLIANCE_DATA_3220 = normalizeComplianceData(complianceRawData);
        const classificationRawData = await classificationRes.json();
        CLASSIFICATION_DATA_3296 = normalizeClassificationData(classificationRawData);
    } catch (err) {
        console.error('Data loading failed:', err);
        throw err;
    }
}

// =====================================================
// CONSTANTS
// =====================================================

const MASTER_ACCOUNT = { username: 'master', password: 'master', fullName: 'Master Account', role: 'master' };

const STORAGE_KEYS = {
    users: 'hcs_users',
    assessments: 'hcs_assessments',
    reports: 'hcs_reports'
};
const UI_TEXT = {
    en: {
        loginTitle: 'Hotel Classification and Rating System',
        loginSubtitle: "Based on O'z DSt 3220:2023 and MST 125",
        usernameLabel: 'Username',
        passwordLabel: 'Password',
        usernamePlaceholder: 'Enter username',
        passwordPlaceholder: 'Enter password',
        loginButton: 'Login',
        loginHint: 'Administrator account: master / master',
        loadingData: 'Loading standards...',
        headerTitle: 'Hotel Classification',
        navDashboard: 'Dashboard',
        navAssessment: 'Assessment',
        navCompare: 'Compare',
        navReports: 'Reports',
        logout: 'Sign Out',
        dashboardTitle: 'Classification Dashboard',
        accommodationTypeLabel: 'Accommodation Type',
        complianceFacilityTypeLabel: 'Facility Type',
        allCategories: 'All Categories',
        compareTitle: 'Star-Level Comparison',
        compareSubtitle: 'Compare mandatory requirements across all star levels',
        complianceTitle: "O'z DSt 3220:2023 - Compliance",
        classificationTitle: 'MST 125',
        complete3220: 'Complete 3220 Assessment',
        complete3296: 'Complete MST 125 Assessment',
        generateReport: 'Generate Report',
        openCompliance: 'Open 3220 Compliance',
        openHotelInfo: 'Hotel Information',
        assessmentsTitle: 'Assessments',
        reportsTitle: 'Reports',
        usersTitle: 'Users',
        fullNameLabel: 'Full Name',
        fullNamePlaceholder: 'Full name',
        newUsernameLabel: 'Username',
        newUsernamePlaceholder: 'Username',
        newPasswordLabel: 'Password',
        newPasswordPlaceholder: 'Password',
        createUser: 'Create User',
        starLabel: 'Star',
        minPts: 'Min',
        mandatory: 'Mandatory',
        optional: 'Optional',
        criterionLabel: 'Criterion',
        yes: 'Yes',
        no: 'No',
        na: 'N/A',
        assessmentTitle: 'Assessment',
        assessmentPanelTitle: 'Hotel Assessment',
        assessmentPanelSubtitle: 'Check criteria your hotel meets',
        assessPointsLabel: 'Points',
        assessCountLabel: 'Criteria',
        assessMandatoryLabel: '5★ Mandatory',
        assessEligibleLabel: 'Eligible Star Rating',
        resetAssessment: 'Reset Assessment',
        resetConfirm: 'Do you want to clear all assessment answers?',
        assessmentRequiredFields: 'Please complete all required Hotel Information and Contact Details fields.',
        hotelInfo: 'Hotel Information',
        contactDetails: 'Contact Details',
        hotelName: 'Hotel Name',
        address: 'Address',
        roomCount: 'Number of Rooms',
        assessmentDate: 'Assessment Date',
        contactPerson: 'Contact Person',
        phone: 'Phone',
        email: 'Email',
        start3220: '3220',
        start3296: 'MST 125',
        reportTitle: 'Hotel Classification Assessment Report',
        reportStandard: "O'z DSt 3220:2023 & MST 125",
        reportToolsTitle: 'Report Center',
        reportToolsSubtitle: 'Generate and export classification reports',
        reportCardFullTitle: 'Full Assessment Report',
        reportCardFullDesc: 'Complete report with points breakdown',
        reportCardGapTitle: 'Gap Analysis',
        reportCardGapDesc: 'Missing criteria for each star level',
        reportCardMandatoryTitle: 'Mandatory Checklist',
        reportCardMandatoryDesc: 'Required criteria for target star',
        reportCardExportTitle: 'Export Data',
        reportCardExportDesc: 'Download assessment as JSON',
        gapReportTitle: 'Gap Analysis',
        mandatoryReportTitle: 'Mandatory Checklist',
        exportFileName: 'hotel-assessment',
        reportPlaceholder: 'Complete assessments to generate a report',
        reportHotelName: 'Hotel Name',
        reportAddress: 'Address',
        reportRooms: 'Number of Rooms',
        reportDate: 'Assessment Date',
        reportInspector: 'Inspector',
        reportTarget: 'Target Classification',
        roleMaster: 'Administrator',
        roleInspector: 'Inspector',
        reportCompliant: 'COMPLIANT',
        reportNotCompliant: 'NOT COMPLIANT',
        reportAllMandatoryMet: 'All mandatory compliance requirements are met.',
        reportFailedRequirements: '{count} mandatory requirement(s) not met.',
        legalStatusTitle: 'Legal Status',
        legalStatusText: "This hotel is NOT in compliance with O'z DSt 3220:2023. Any classification result from MST 125 is NOT legally valid until compliance is achieved.",
        reportClassificationAchieved: '{star}-Star Classification',
        reportClassificationNotAchieved: 'Classification Not Achieved',
        reportImportant: 'Important',
        reportTechnicalOnly: "This classification result is for technical review only and is not legally valid because O'z DSt 3220:2023 is not compliant.",
        reportFailedMandatoryTitle: 'Failed Mandatory Criteria for {star}-Star',
        reportInsufficientPoints: 'Insufficient Points',
        reportTotalPoints: 'Total points:',
        reportRequired: 'Required:',
        reportShortfall: 'Shortfall:',
        pointsLabel: 'points',
        quantityLabel: 'Quantity',
        scoreLabel: 'Score',
        maxLabel: 'Max',
        unitLabel: 'unit',
        mandatoryPointsAchieved: 'Mandatory Points Achieved',
        optionalPointsAchieved: 'Optional Points Achieved',
        mandatoryPointsRequired: 'Required Mandatory Points',
        optionalPointsRequired: 'Required Optional Points',
        statTotalLabel: 'Total Criteria',
        statCategoriesLabel: 'Categories',
        statMaxPointsLabel: 'Max Points',
        statMandatoryLabel: 'Mandatory 5★',
        emailAction: 'Email',
        printAction: 'Print',
        savePdfAction: 'Save PDF',
        closeAction: 'Close',
        deleteAction: 'Delete',
        viewAction: 'View',
        noAssessments: 'No assessments available.',
        noReports: 'No reports available.',
        noUsers: 'No users available.',
        noItems: 'No items found.',
        popupBlocked: 'Popup was blocked by the browser',
        dataLoadError: 'Failed to load standards data files',
        invalidCredentials: 'Invalid username or password',
        userCreated: 'User has been created',
        fillAllFields: 'Please complete all user fields',
        usernameReserved: 'This username is reserved',
        usernameExists: 'Username already exists',
        progressTitle: 'Assessment Progress',
        assessedLabel: 'assessed',
        fulfilledLabel: 'Fulfilled',
        fulfilledSub: 'Criteria met',
        missingLabel: 'Missing',
        missingSub: 'Criteria not met',
        mandatoryLabel: 'Mandatory',
        mandatorySub: 'For selected star',
        evidenceLabel: 'Evidence',
        evidenceSub: 'Files uploaded',
        filterMandatory: 'Show Mandatory Only',
        filterMissing: 'Show Missing Only',
        classificationSearchPlaceholder: 'Search...',
        classificationHideCheckedLabel: 'Unchecked only',
        notificationTitle: 'Notifications',
        notificationClear: 'Clear All',
        notificationEmpty: 'No notifications',
        resolutionTitle: 'Resolution',
        resolutionHeaderTitle: 'Resolution Portal',
        resolutionHeaderSubtitle: 'Submit evidence for missing criteria to resolve deficiencies',
        resolutionEmpty: 'No items pending resolution',
        sendToResolution: 'Send to Resolution',
        resolutionRequiredTitle: 'Resolution Required',
        resolutionRequiredMessage: '{count} criteria sent to resolution',
        resolutionSubmittedTitle: 'Resolution Submitted',
        resolutionSubmit: 'Submit for Review',
        resolutionStatusPending: 'PENDING',
        resolutionStatusSubmitted: 'SUBMITTED',
        evidenceTitle: 'Evidence',
        photoLabel: 'Photo',
        videoLabel: 'Video',
        documentLabel: 'Document',
        adminUsersTitle: 'User Management',
        addUserTitle: 'Add User',
        addUserSubtitle: 'Create inspector access',
        addUserOpen: '+ Add User',
        addUserCancel: 'Cancel',
        addUserSubmit: 'Add User',
        userTableUsername: 'Username',
        userTableName: 'Full Name',
        userTableRole: 'Role',
        userTableStatus: 'Status',
        userTableActions: 'Actions',
        statusActive: 'Active'
    },
    uz: {
        loginTitle: 'Mehmonxona tasniflash tizimi',
        loginSubtitle: "O'z DSt 3220:2023 & MST 125",
        usernameLabel: 'Foydalanuvchi nomi',
        passwordLabel: 'Parol',
        usernamePlaceholder: 'Foydalanuvchi nomini kiriting',
        passwordPlaceholder: 'Parolni kiriting',
        loginButton: 'Kirish',
        loginHint: 'Master: master/master',
        loadingData: "Standartlar yuklanmoqda...",
        headerTitle: 'Tasniflash',
        navDashboard: 'Bosh sahifa',
        navAssessment: 'Baholash',
        navCompare: 'Taqqoslash',
        navReports: 'Hisobotlar',
        logout: 'Chiqish',
        dashboardTitle: 'Yulduz reytingi maʼlumoti',
        accommodationTypeLabel: 'Joylashtirish turi',
        complianceFacilityTypeLabel: 'Joylashtirish turi',
        allCategories: 'Barcha bo‘limlar',
        compareTitle: 'Yulduz darajalarini taqqoslash',
        compareSubtitle: 'Yulduzlar bo‘yicha majburiy talablarni taqqoslang',
        complianceTitle: "O'z DSt 3220:2023 - Muvofiqlik",
        classificationTitle: 'MST 125',
        complete3220: '3220 Yakunlash',
        complete3296: 'MST 125 Yakunlash',
        generateReport: 'Hisobot yaratish',
        openCompliance: '3220 Muvofiqlik',
        openHotelInfo: 'Mehmonxona maʼlumoti',
        assessmentsTitle: 'Baholashlar',
        reportsTitle: 'Hisobotlar',
        usersTitle: 'Foydalanuvchilar',
        fullNameLabel: 'To‘liq ism',
        fullNamePlaceholder: 'To‘liq ism',
        newUsernameLabel: 'Foydalanuvchi nomi',
        newUsernamePlaceholder: 'Foydalanuvchi nomi',
        newPasswordLabel: 'Parol',
        newPasswordPlaceholder: 'Parol',
        createUser: 'Foydalanuvchi yaratish',
        starLabel: 'Yulduz',
        minPts: 'Min',
        mandatory: 'Majburiy',
        optional: 'Ixtiyoriy',
        criterionLabel: 'Mezon',
        yes: 'Ha',
        no: 'Yo‘q',
        na: 'N/A',
        assessmentTitle: 'Baholash',
        assessmentPanelTitle: 'Mehmonxona baholash',
        assessmentPanelSubtitle: 'Mehmonxona bajargan mezonlarni belgilang',
        assessPointsLabel: 'Ballar',
        assessCountLabel: 'Mezonlar',
        assessMandatoryLabel: '5★ Majburiy',
        assessEligibleLabel: 'Mos keladigan reyting',
        resetAssessment: 'Qayta tiklash',
        resetConfirm: 'Baholash javoblarini tozalaysizmi?',
        assessmentRequiredFields: "Mehmonxona ma'lumoti va aloqa ma'lumotlari bo'yicha barcha majburiy maydonlarni to'ldiring.",
        hotelInfo: 'Mehmonxona maʼlumoti',
        contactDetails: 'Aloqa maʼlumotlari',
        hotelName: 'Mehmonxona nomi',
        address: 'Manzil',
        roomCount: 'Xonalar soni',
        assessmentDate: 'Baholash sanasi',
        contactPerson: 'Aloqa shaxsi',
        phone: 'Telefon',
        email: 'Email',
        start3220: '3220',
        start3296: 'MST 125',
        reportTitle: 'Mehmonxona baholash hisobotı',
        reportStandard: "O'z DSt 3220:2023 & MST 125",
        reportToolsTitle: 'Hisobot yaratish',
        reportToolsSubtitle: 'Tasniflash bo‘yicha batafsil hisobotlar',
        reportCardFullTitle: 'To‘liq baholash',
        reportCardFullDesc: 'Ballar bo‘yicha batafsil hisobot',
        reportCardGapTitle: 'Farq tahlili',
        reportCardGapDesc: 'Har bir yulduz uchun yetishmaydigan mezonlar',
        reportCardMandatoryTitle: 'Majburiy ro‘yxat',
        reportCardMandatoryDesc: 'Tanlangan yulduz uchun majburiy mezonlar',
        reportCardExportTitle: 'Maʼlumot eksporti',
        reportCardExportDesc: 'Baholashni JSON ko‘rinishda yuklab olish',
        gapReportTitle: 'Farq tahlili',
        mandatoryReportTitle: 'Majburiy ro‘yxat',
        exportFileName: 'hotel-baholash',
        reportPlaceholder: 'Hisobot yaratish uchun baholashni yakunlang',
        reportHotelName: 'Mehmonxona nomi',
        reportAddress: 'Manzil',
        reportRooms: 'Xonalar soni',
        reportDate: 'Baholash sanasi',
        reportInspector: 'Inspektor',
        reportTarget: 'Maqsadli tasnif',
        roleMaster: 'Master',
        roleInspector: 'Inspektor',
        reportCompliant: 'MUVOFIQ',
        reportNotCompliant: 'MUVOFIQ EMAS',
        reportAllMandatoryMet: 'Barcha majburiy talablar bajarilgan.',
        reportFailedRequirements: '{count} ta talab bajarilmadi.',
        legalStatusTitle: 'Yuridik holat',
        legalStatusText: "Ushbu mehmonxona O'z DSt 3220:2023 ga MUVOFIQ EMAS. MST 125 bo‘yicha tasniflash natijasi muvofiqlik taʼminlanguncha yuridik kuchga ega emas.",
        reportClassificationAchieved: '{star}-Yulduzli tasnif',
        reportClassificationNotAchieved: 'Tasniflashga erishilmadi',
        reportImportant: 'Muhim:',
        reportTechnicalOnly: "Bu tasniflash natijasi FAQAT texnik bo‘lib, O'z DSt 3220:2023 talablariga muvofiq bo‘lmagani sababli yuridik kuchga ega emas.",
        reportFailedMandatoryTitle: '{star}-Yulduz uchun majburiy talablar bajarilmadi',
        reportInsufficientPoints: 'Ball yetarli emas',
        reportTotalPoints: 'Jami ball:',
        reportRequired: 'Kerakli:',
        reportShortfall: 'Kamchilik:',
        pointsLabel: 'ball',
        quantityLabel: 'Miqdor',
        scoreLabel: 'Ball',
        maxLabel: 'Maks',
        unitLabel: 'birlik',
        mandatoryPointsAchieved: 'Majburiy ballar (olingan)',
        optionalPointsAchieved: 'Ixtiyoriy ballar (olingan)',
        mandatoryPointsRequired: 'Majburiy ballar (kerakli)',
        optionalPointsRequired: 'Ixtiyoriy ballar (kerakli)',
        statTotalLabel: 'Jami mezonlar',
        statCategoriesLabel: 'Bo‘limlar',
        statMaxPointsLabel: 'Maks ball',
        statMandatoryLabel: 'Majburiy 5★',
        emailAction: 'Email',
        printAction: 'Chop etish',
        savePdfAction: 'PDF saqlash',
        closeAction: 'Yopish',
        deleteAction: 'O‘chirish',
        viewAction: 'Ko‘rish',
        noAssessments: 'Baholashlar mavjud emas.',
        noReports: 'Hisobotlar mavjud emas.',
        noUsers: 'Foydalanuvchilar mavjud emas.',
        noItems: 'Maʼlumot topilmadi.',
        popupBlocked: 'Popup bloklangan',
        dataLoadError: 'Maʼlumotlar yuklanmadi',
        invalidCredentials: 'Login yoki parol noto‘g‘ri',
        userCreated: 'Foydalanuvchi yaratildi',
        fillAllFields: 'Barcha maydonlarni to‘ldiring',
        usernameReserved: 'Bu nom band',
        usernameExists: 'Foydalanuvchi nomi mavjud',
        progressTitle: 'Baholash jarayoni',
        assessedLabel: 'baholangan',
        fulfilledLabel: 'Bajarilgan',
        fulfilledSub: 'Mezonlar bajarildi',
        missingLabel: 'Bajarilmagan',
        missingSub: 'Mezonlar bajarilmadi',
        mandatoryLabel: 'Majburiy',
        mandatorySub: 'Tanlangan yulduz uchun',
        evidenceLabel: 'Dalillar',
        evidenceSub: 'Yuklangan fayllar',
        filterMandatory: 'Faqat majburiy',
        filterMissing: 'Bajarilmaganlarni ko‘rsatish',
        classificationSearchPlaceholder: 'Qidirish...',
        classificationHideCheckedLabel: 'Bajarilmaganlar',
        notificationTitle: 'Bildirishnomalar',
        notificationClear: 'Tozalash',
        notificationEmpty: 'Bildirishnomalar yo‘q',
        resolutionTitle: 'Yechim',
        resolutionHeaderTitle: 'Yechim portali',
        resolutionHeaderSubtitle: 'Yetishmayotgan mezonlar bo‘yicha dalillarni yuboring',
        resolutionEmpty: 'Yechim uchun elementlar yo‘q',
        sendToResolution: 'Yechimga yuborish',
        resolutionRequiredTitle: 'Yechim talab qilinadi',
        resolutionRequiredMessage: '{count} ta mezon yechimga yuborildi',
        resolutionSubmittedTitle: 'Yechim yuborildi',
        resolutionSubmit: 'Ko‘rib chiqishga yuborish',
        resolutionStatusPending: 'KUTILMOQDA',
        resolutionStatusSubmitted: 'YUBORILDI',
        evidenceTitle: 'Dalillar',
        photoLabel: 'Foto',
        videoLabel: 'Video',
        documentLabel: 'Hujjat',
        adminUsersTitle: 'Foydalanuvchilar boshqaruvi',
        addUserTitle: 'Foydalanuvchi qo‘shish',
        addUserSubtitle: 'Inspektor kirishini yaratish',
        addUserOpen: '+ Foydalanuvchi qo‘shish',
        addUserCancel: 'Bekor qilish',
        addUserSubmit: 'Qo‘shish',
        userTableUsername: 'Foydalanuvchi nomi',
        userTableName: 'To‘liq ism',
        userTableRole: 'Rol',
        userTableStatus: 'Holat',
        userTableActions: 'Amallar',
        statusActive: 'Faol'
    },
    ru: {
        loginTitle: 'Система классификации гостиниц',
        loginSubtitle: "O'z DSt 3220:2023 & MST 125",
        usernameLabel: 'Имя пользователя',
        passwordLabel: 'Пароль',
        usernamePlaceholder: 'Введите имя пользователя',
        passwordPlaceholder: 'Введите пароль',
        loginButton: 'Войти',
        loginHint: 'Master: master/master',
        loadingData: 'Загрузка стандартов...',
        headerTitle: 'Классификация',
        navDashboard: 'Панель',
        navAssessment: 'Оценка',
        navCompare: 'Сравнение',
        navReports: 'Отчеты',
        logout: 'Выйти',
        dashboardTitle: 'Информация о рейтинге',
        accommodationTypeLabel: 'Тип размещения',
        complianceFacilityTypeLabel: 'Тип средства размещения',
        allCategories: 'Все категории',
        compareTitle: 'Сравнение уровней',
        compareSubtitle: 'Сравнение обязательных требований по звездам',
        complianceTitle: "O'z DSt 3220:2023 - Соответствие",
        classificationTitle: 'MST 125',
        complete3220: 'Завершить 3220',
        complete3296: 'Завершить MST 125',
        generateReport: 'Сформировать отчет',
        openCompliance: 'Соответствие 3220',
        openHotelInfo: 'Информация об отеле',
        assessmentsTitle: 'Оценки',
        reportsTitle: 'Отчеты',
        usersTitle: 'Пользователи',
        fullNameLabel: 'Полное имя',
        fullNamePlaceholder: 'Полное имя',
        newUsernameLabel: 'Имя пользователя',
        newUsernamePlaceholder: 'Имя пользователя',
        newPasswordLabel: 'Пароль',
        newPasswordPlaceholder: 'Пароль',
        createUser: 'Создать пользователя',
        starLabel: 'Звезда',
        minPts: 'Мин',
        mandatory: 'Обязательные',
        optional: 'Дополнительные',
        criterionLabel: 'Критерий',
        yes: 'Да',
        no: 'Нет',
        na: 'Н/Д',
        assessmentTitle: 'Оценка',
        assessmentPanelTitle: 'Оценка отеля',
        assessmentPanelSubtitle: 'Отметьте критерии, которые выполнены',
        assessPointsLabel: 'Баллы',
        assessCountLabel: 'Критерии',
        assessMandatoryLabel: '5★ Обязательные',
        assessEligibleLabel: 'Допустимый рейтинг',
        resetAssessment: 'Сбросить',
        resetConfirm: 'Сбросить ответы оценки?',
        assessmentRequiredFields: 'Заполните все обязательные поля в разделах информации об отеле и контактных данных.',
        hotelInfo: 'Информация о гостинице',
        contactDetails: 'Контактные данные',
        hotelName: 'Название гостиницы',
        address: 'Адрес',
        roomCount: 'Количество номеров',
        assessmentDate: 'Дата оценки',
        contactPerson: 'Контактное лицо',
        phone: 'Телефон',
        email: 'Email',
        start3220: '3220',
        start3296: 'MST 125',
        reportTitle: 'Отчет об оценке гостиницы',
        reportStandard: "O'z DSt 3220:2023 & MST 125",
        reportToolsTitle: 'Генерация отчетов',
        reportToolsSubtitle: 'Детальные отчеты по классификации',
        reportCardFullTitle: 'Полная оценка',
        reportCardFullDesc: 'Полный отчет с баллами',
        reportCardGapTitle: 'Анализ разрывов',
        reportCardGapDesc: 'Недостающие критерии по звездам',
        reportCardMandatoryTitle: 'Обязательный список',
        reportCardMandatoryDesc: 'Обязательные критерии для выбранной звезды',
        reportCardExportTitle: 'Экспорт данных',
        reportCardExportDesc: 'Скачать оценку в JSON',
        gapReportTitle: 'Анализ разрывов',
        mandatoryReportTitle: 'Обязательный список',
        exportFileName: 'hotel-otsenka',
        reportPlaceholder: 'Завершите оценку для формирования отчета',
        reportHotelName: 'Название гостиницы',
        reportAddress: 'Адрес',
        reportRooms: 'Количество номеров',
        reportDate: 'Дата оценки',
        reportInspector: 'Инспектор',
        reportTarget: 'Целевая классификация',
        roleMaster: 'Мастер',
        roleInspector: 'Инспектор',
        reportCompliant: 'СООТВЕТСТВУЕТ',
        reportNotCompliant: 'НЕ СООТВЕТСТВУЕТ',
        reportAllMandatoryMet: 'Все обязательные требования выполнены.',
        reportFailedRequirements: 'Не выполнено требований: {count}.',
        legalStatusTitle: 'Юридический статус',
        legalStatusText: "Эта гостиница НЕ соответствует O'z DSt 3220:2023. Результат классификации по MST 125 не имеет юридической силы до достижения соответствия.",
        reportClassificationAchieved: 'Классификация {star} звезды',
        reportClassificationNotAchieved: 'Классификация не достигнута',
        reportImportant: 'Важно:',
        reportTechnicalOnly: "Этот результат классификации является ТЕХНИЧЕСКИМ и не имеет юридической силы из-за несоответствия O'z DSt 3220:2023.",
        reportFailedMandatoryTitle: 'Не выполнены обязательные требования для {star} звезд',
        reportInsufficientPoints: 'Недостаточно баллов',
        reportTotalPoints: 'Всего баллов:',
        reportRequired: 'Требуется:',
        reportShortfall: 'Недобор:',
        pointsLabel: 'баллов',
        quantityLabel: 'Количество',
        scoreLabel: 'Баллы',
        maxLabel: 'Макс',
        unitLabel: 'единица',
        mandatoryPointsAchieved: 'Обязательные баллы (получено)',
        optionalPointsAchieved: 'Доп. баллы (получено)',
        mandatoryPointsRequired: 'Обязательные баллы (нужно)',
        optionalPointsRequired: 'Доп. баллы (нужно)',
        statTotalLabel: 'Всего критериев',
        statCategoriesLabel: 'Категории',
        statMaxPointsLabel: 'Макс баллы',
        statMandatoryLabel: 'Обязательные 5★',
        emailAction: 'Email',
        printAction: 'Печать',
        savePdfAction: 'Сохранить PDF',
        closeAction: 'Закрыть',
        deleteAction: 'Удалить',
        viewAction: 'Просмотр',
        noAssessments: 'Оценок пока нет.',
        noReports: 'Отчетов пока нет.',
        noUsers: 'Пользователей пока нет.',
        noItems: 'Нет данных.',
        popupBlocked: 'Всплывающее окно заблокировано',
        dataLoadError: 'Не удалось загрузить данные',
        invalidCredentials: 'Неверный логин или пароль',
        userCreated: 'Пользователь создан',
        fillAllFields: 'Заполните все поля',
        usernameReserved: 'Имя занято',
        usernameExists: 'Имя пользователя уже существует',
        progressTitle: 'Прогресс оценки',
        assessedLabel: 'оценено',
        fulfilledLabel: 'Выполнено',
        fulfilledSub: 'Критерии выполнены',
        missingLabel: 'Не выполнено',
        missingSub: 'Критерии не выполнены',
        mandatoryLabel: 'Обязательные',
        mandatorySub: 'Для выбранной звезды',
        evidenceLabel: 'Доказательства',
        evidenceSub: 'Файлов загружено',
        filterMandatory: 'Только обязательные',
        filterMissing: 'Показать пропуски',
        classificationSearchPlaceholder: 'Поиск...',
        classificationHideCheckedLabel: 'Только непроверенные',
        notificationTitle: 'Уведомления',
        notificationClear: 'Очистить',
        notificationEmpty: 'Уведомлений нет',
        resolutionTitle: 'Устранение',
        resolutionHeaderTitle: 'Портал устранения',
        resolutionHeaderSubtitle: 'Загрузите доказательства по отсутствующим критериям',
        resolutionEmpty: 'Нет элементов для устранения',
        sendToResolution: 'Отправить на устранение',
        resolutionRequiredTitle: 'Требуется устранение',
        resolutionRequiredMessage: '{count} критериев отправлено на устранение',
        resolutionSubmittedTitle: 'Устранение отправлено',
        resolutionSubmit: 'Отправить на проверку',
        resolutionStatusPending: 'ОЖИДАЕТСЯ',
        resolutionStatusSubmitted: 'ОТПРАВЛЕНО',
        evidenceTitle: 'Доказательства',
        photoLabel: 'Фото',
        videoLabel: 'Видео',
        documentLabel: 'Документ',
        adminUsersTitle: 'Управление пользователями',
        addUserTitle: 'Добавить пользователя',
        addUserSubtitle: 'Создать доступ инспектора',
        addUserOpen: '+ Добавить пользователя',
        addUserCancel: 'Отмена',
        addUserSubmit: 'Добавить',
        userTableUsername: 'Имя пользователя',
        userTableName: 'Полное имя',
        userTableRole: 'Роль',
        userTableStatus: 'Статус',
        userTableActions: 'Действия',
        statusActive: 'Активен'
    }
};

// =====================================================
// STATE VARIABLES
// =====================================================

let currentLang = 'en';
let currentUser = null;
let selectedStar = 3;
let selectedAccommodationType = 'hotels_and_similar';
let selectedComplianceFacilityType = 'hotels_and_similar';
let complianceAnswers = {};
let classificationAnswers = {};
let classificationQuantities = {};
let assessmentData = {
    hotelName: '',
    hotelAddress: '',
    roomCount: '',
    assessmentDate: '',
    contactName: '',
    contactPhone: '',
    contactEmail: ''
};
let assessments = [];
let reports = [];
let evidenceData = {};
let notifications = [];
let resolutions = [];
let currentUpload = null;
const WORKING_STATE_KEY = 'hcs_working_state';
let toastTimerId = null;

// =====================================================
// I18N + STORAGE
// =====================================================

function t(key) {
    const langTable = UI_TEXT[currentLang] || UI_TEXT.en;
    return langTable[key] ?? UI_TEXT.en[key] ?? key;
}

function safeJsonParse(value, fallback) {
    try {
        if (!value) return fallback;
        const parsed = JSON.parse(value);
        return parsed ?? fallback;
    } catch (err) {
        return fallback;
    }
}

function getStoredArray(key) {
    const parsed = safeJsonParse(localStorage.getItem(key), []);
    return Array.isArray(parsed) ? parsed : [];
}

function setStoredArray(key, value) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function getStoredUsers() {
    return getStoredArray(STORAGE_KEYS.users);
}

function setStoredUsers(users) {
    setStoredArray(STORAGE_KEYS.users, users);
}

function loadStoredData() {
    assessments = getStoredArray(STORAGE_KEYS.assessments);
    reports = getStoredArray(STORAGE_KEYS.reports);

    const workingState = safeJsonParse(localStorage.getItem(WORKING_STATE_KEY), {});
    if (workingState && typeof workingState === 'object') {
        if (['en', 'uz', 'ru'].includes(workingState.currentLang)) {
            currentLang = workingState.currentLang;
        }
        if (typeof workingState.selectedStar !== 'undefined') {
            const star = Number(workingState.selectedStar);
            if (Number.isFinite(star) && star >= 1 && star <= 5) selectedStar = star;
        }
        if (typeof workingState.selectedAccommodationType === 'string' && workingState.selectedAccommodationType.trim()) {
            selectedAccommodationType = workingState.selectedAccommodationType;
        }
        if (typeof workingState.selectedComplianceFacilityType === 'string' && workingState.selectedComplianceFacilityType.trim()) {
            selectedComplianceFacilityType = workingState.selectedComplianceFacilityType;
        }
        if (workingState.complianceAnswers && typeof workingState.complianceAnswers === 'object') {
            complianceAnswers = { ...workingState.complianceAnswers };
        }
        if (workingState.classificationAnswers && typeof workingState.classificationAnswers === 'object') {
            classificationAnswers = { ...workingState.classificationAnswers };
        }
        if (workingState.classificationQuantities && typeof workingState.classificationQuantities === 'object') {
            classificationQuantities = normalizeQuantityMap(workingState.classificationQuantities);
        }
        if (workingState.assessmentData && typeof workingState.assessmentData === 'object') {
            assessmentData = { ...assessmentData, ...workingState.assessmentData };
        }
        if (workingState.evidenceData && typeof workingState.evidenceData === 'object') {
            evidenceData = { ...workingState.evidenceData };
        }
        if (Array.isArray(workingState.notifications)) {
            notifications = workingState.notifications.slice();
        }
        if (Array.isArray(workingState.resolutions)) {
            resolutions = workingState.resolutions.slice();
        }
    }

    if (!assessmentData.assessmentDate) {
        assessmentData.assessmentDate = new Date().toISOString().split('T')[0];
    }
}

function persistWorkingState() {
    localStorage.setItem(WORKING_STATE_KEY, JSON.stringify({
        currentLang,
        selectedStar,
        selectedAccommodationType,
        selectedComplianceFacilityType,
        complianceAnswers,
        classificationAnswers,
        classificationQuantities,
        assessmentData,
        evidenceData,
        notifications,
        resolutions
    }));
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
    const loginButton = document.getElementById('loginButton');
    const loginHint = document.getElementById('loginHint');
    if (loginButton) loginButton.disabled = true;
    if (loginHint) loginHint.textContent = t('loadingData');

    if (!assessmentData.assessmentDate) {
        assessmentData.assessmentDate = new Date().toISOString().split('T')[0];
    }
    loadStoredData();
    try {
        await loadData();
    } catch (err) {
        console.error('Failed to initialize:', err);
        showToast(t('dataLoadError'), 'error');
        if (loginHint) loginHint.textContent = t('dataLoadError');
        return;
    }
    initEventListeners();
    applyLanguage();
    if (loginButton) loginButton.disabled = false;
    if (loginHint) loginHint.textContent = t('loginHint');
});

// =====================================================
// STAR CARDS
// =====================================================

function initStarCards() {
    const container = document.getElementById('starCards');
    const totalCriteriaCount = getTotalClassificationCriteriaCount();
    container.innerHTML = '';
    ensureAccommodationTypeSelection();

    CLASSIFICATION_DATA_3296.starLevels.forEach(level => {
        const mandatoryCount = getMandatoryIdsForLevel(level).length;
        const optionalCount = Math.max(0, totalCriteriaCount - mandatoryCount);
        const minPoints = getMinPointsForStar(level.star);
        const card = document.createElement('div');
        card.className = 'star-card' + (level.star === selectedStar ? ' selected' : '');
        card.innerHTML = `
            <div class="stars">${level.label}</div>
            <div class="label">${level.star} ${t('starLabel')}</div>
            <div class="points">${t('minPts')}: ${minPoints} ${t('pointsLabel')}</div>
            <div class="points">${t('mandatory')}: ${mandatoryCount}</div>
            <div class="points">${t('optional')}: ${optionalCount}</div>
        `;
        card.onclick = () => openStarModal(level.star);
        container.appendChild(card);
    });
}

function selectStar(star) {
    selectedStar = star;
    document.querySelectorAll('.star-card').forEach((c, i) => {
        c.classList.toggle('selected', CLASSIFICATION_DATA_3296.starLevels[i].star === star);
    });
    renderClassificationCriteria();
    updateStats();
}

function openStarModal(star) {
    selectStar(star);
    const modal = document.getElementById('starModal');
    const title = document.getElementById('starModalTitle');
    const subtitle = document.getElementById('starModalSubtitle');
    const totalCriteriaCount = getTotalClassificationCriteriaCount();
    const starLevel = CLASSIFICATION_DATA_3296.starLevels.find(l => l.star === star);
    const mandatoryCount = starLevel ? getMandatoryIdsForLevel(starLevel).length : 0;
    const optionalCount = Math.max(0, totalCriteriaCount - mandatoryCount);

    if (title) title.textContent = `${star} ${t('starLabel')}`;
    if (subtitle) subtitle.textContent = `${t('mandatory')}: ${mandatoryCount} | ${t('optional')}: ${optionalCount}`;
    if (modal) {
        modal.dataset.star = String(star);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }
}

function closeStarModal() {
    const modal = document.getElementById('starModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function openStarListing(type) {
    const modal = document.getElementById('starModal');
    const star = modal ? Number(modal.dataset.star || selectedStar) : selectedStar;
    const starLevel = CLASSIFICATION_DATA_3296.starLevels.find(l => l.star === star);
    if (!starLevel) return;

    const listingHtml = buildStarListingHtml(starLevel, type);
    const win = window.open('', '_blank');
    if (!win) {
        showToast(t('popupBlocked'), 'error');
        return;
    }
    win.document.write(listingHtml);
    win.document.close();
    closeStarModal();
}

function openAssessmentWindow() {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        showToast(t('popupBlocked'), 'error');
        return;
    }
    const html = buildAssessmentWindowHtml(getAssessmentData());
    win.document.write(html);
    win.document.close();
}

// =====================================================
// EVENT LISTENERS
// =====================================================

function initEventListeners() {
    // Login
    document.getElementById('loginForm').onsubmit = (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (username === MASTER_ACCOUNT.username && password === MASTER_ACCOUNT.password) {
            currentUser = { ...MASTER_ACCOUNT };
        } else {
            const users = getStoredUsers();
            const match = users.find(u => u.username === username && u.password === password);
            if (!match) {
                showToast(t('invalidCredentials'), 'error');
                return;
            }
            currentUser = { ...match, role: 'inspector' };
        }

        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        document.getElementById('displayUserName').textContent = currentUser.fullName;
        document.getElementById('displayUserRole').textContent = currentUser.role === 'master' ? t('roleMaster') : t('roleInspector');
        document.getElementById('userAvatar').textContent = currentUser.fullName.charAt(0);

        applyMasterVisibility();
        renderComplianceSections();
        renderClassificationCriteria();
        updateStats();
        renderManagementLists();
        updateNotifications();
        renderResolutions();
    };

    // Logout
    document.getElementById('logoutBtn').onclick = () => {
        currentUser = null;
        document.getElementById('loginPage').style.display = '';
        document.getElementById('appContainer').style.display = 'none';
    };

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            showPage(btn.dataset.page);
        };
    });

    // Language
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.onclick = () => {
            currentLang = btn.dataset.lang;
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b === btn));
            applyLanguage();
        };
    });

    const accommodationTypeSelect = document.getElementById('accommodationTypeSelect');
    if (accommodationTypeSelect) {
        accommodationTypeSelect.addEventListener('change', () => {
            selectedAccommodationType = accommodationTypeSelect.value;
            initStarCards();
            renderClassificationCriteria();
            updateStats();
        });
    }

    const complianceFacilityTypeSelect = document.getElementById('complianceFacilityTypeSelect');
    if (complianceFacilityTypeSelect) {
        complianceFacilityTypeSelect.addEventListener('change', () => {
            selectedComplianceFacilityType = complianceFacilityTypeSelect.value;
            renderComplianceSections();
            updateStats();
        });
    }

    const starModal = document.getElementById('starModal');
    const starModalCloseBtn = document.getElementById('starModalCloseBtn');
    const starModalMandatoryBtn = document.getElementById('starModalMandatoryBtn');
    const starModalOptionalBtn = document.getElementById('starModalOptionalBtn');

    if (starModal) {
        starModal.addEventListener('click', (e) => {
            if (e.target === starModal) closeStarModal();
        });
    }
    if (starModalCloseBtn) starModalCloseBtn.onclick = closeStarModal;
    if (starModalMandatoryBtn) starModalMandatoryBtn.onclick = () => openStarListing('mandatory');
    if (starModalOptionalBtn) starModalOptionalBtn.onclick = () => openStarListing('optional');

    const filterMandatoryBtn = document.getElementById('filterMandatoryBtn');
    if (filterMandatoryBtn) {
        filterMandatoryBtn.addEventListener('click', () => {
            filterMandatoryBtn.classList.toggle('active');
            renderClassificationCriteria();
        });
    }

    const filterMissingBtn = document.getElementById('filterMissingBtn');
    if (filterMissingBtn) {
        filterMissingBtn.addEventListener('click', () => {
            filterMissingBtn.classList.toggle('active');
            renderClassificationCriteria();
        });
    }

    const classificationSearch = document.getElementById('classificationSearch');
    if (classificationSearch) {
        classificationSearch.addEventListener('input', () => renderClassificationCriteria());
    }

    const classificationCategoryFilter = document.getElementById('classificationCategoryFilter');
    if (classificationCategoryFilter) {
        classificationCategoryFilter.addEventListener('change', () => renderClassificationCriteria());
    }

    const classificationHideChecked = document.getElementById('classificationHideChecked');
    if (classificationHideChecked) {
        classificationHideChecked.addEventListener('change', () => renderClassificationCriteria());
    }

    const compareCategoryFilter = document.getElementById('compareCategoryFilter');
    if (compareCategoryFilter) compareCategoryFilter.addEventListener('change', renderCompareTable);

    const openHotelInfoBtn = document.getElementById('openHotelInfoBtn');
    if (openHotelInfoBtn) {
        openHotelInfoBtn.addEventListener('click', () => openAssessmentWindow());
    }

    const openComplianceBtn = document.getElementById('openComplianceBtn');
    if (openComplianceBtn) {
        openComplianceBtn.addEventListener('click', () => showPage('compliance'));
    }

    const resetAssessmentBtn = document.getElementById('resetAssessmentBtn');
    if (resetAssessmentBtn) {
        resetAssessmentBtn.addEventListener('click', resetClassification);
    }

    const openFullReportBtn = document.getElementById('openFullReportBtn');
    if (openFullReportBtn) {
        openFullReportBtn.addEventListener('click', () => generateReport());
    }

    const reportCardFull = document.getElementById('reportCardFull');
    if (reportCardFull) reportCardFull.addEventListener('click', () => generateReport());
    const reportCardGap = document.getElementById('reportCardGap');
    if (reportCardGap) reportCardGap.addEventListener('click', showGapReport);
    const reportCardMandatory = document.getElementById('reportCardMandatory');
    if (reportCardMandatory) reportCardMandatory.addEventListener('click', showMandatoryChecklist);
    const reportCardExport = document.getElementById('reportCardExport');
    if (reportCardExport) reportCardExport.addEventListener('click', exportAssessmentData);

    const notificationBtn = document.getElementById('notificationBtn');
    const notificationPanel = document.getElementById('notificationPanel');
    if (notificationBtn && notificationPanel) {
        notificationBtn.onclick = (e) => {
            e.stopPropagation();
            notificationPanel.classList.toggle('active');
        };
    }

    const clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
    if (clearNotificationsBtn) {
        clearNotificationsBtn.onclick = () => {
            notifications = [];
            updateNotifications();
        };
    }

    const openAddUserBtn = document.getElementById('openAddUserBtn');
    if (openAddUserBtn) {
        openAddUserBtn.onclick = () => openModal('addUserModal');
    }

    const addUserCancelBtn = document.getElementById('addUserCancelBtn');
    if (addUserCancelBtn) {
        addUserCancelBtn.onclick = () => closeModal('addUserModal');
    }

    const addUserModal = document.getElementById('addUserModal');
    if (addUserModal) {
        addUserModal.addEventListener('click', (e) => {
            if (e.target === addUserModal) closeModal('addUserModal');
        });
    }

    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!isMasterUser()) return;
            const usernameInput = document.getElementById('newUsername');
            const passwordInput = document.getElementById('newPassword');
            const fullNameInput = document.getElementById('newFullName');
            const usernameVal = usernameInput ? usernameInput.value.trim() : '';
            const passwordVal = passwordInput ? passwordInput.value.trim() : '';
            const fullNameVal = fullNameInput ? fullNameInput.value.trim() : '';

            if (!usernameVal || !passwordVal || !fullNameVal) {
                showToast(t('fillAllFields'), 'error');
                return;
            }
            if (usernameVal === MASTER_ACCOUNT.username) {
                showToast(t('usernameReserved'), 'error');
                return;
            }
            const users = getStoredUsers();
            if (users.some(u => u.username === usernameVal)) {
                showToast(t('usernameExists'), 'error');
                return;
            }
            users.push({ username: usernameVal, password: passwordVal, fullName: fullNameVal });
            setStoredUsers(users);
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (fullNameInput) fullNameInput.value = '';
            closeModal('addUserModal');
            showToast(t('userCreated'), 'success');
            renderManagementLists();
        });
    }

    const photoInput = document.getElementById('photoInput');
    const videoInput = document.getElementById('videoInput');
    const documentInput = document.getElementById('documentInput');
    if (photoInput) photoInput.onchange = handleFileUpload;
    if (videoInput) videoInput.onchange = handleFileUpload;
    if (documentInput) documentInput.onchange = handleFileUpload;

    document.addEventListener('click', (e) => {
        if (notificationPanel && notificationPanel.classList.contains('active')) {
            if (!notificationPanel.contains(e.target) && (!notificationBtn || !notificationBtn.contains(e.target))) {
                notificationPanel.classList.remove('active');
            }
        }
    });
}

// =====================================================
// PAGE NAVIGATION
// =====================================================

function showPage(page) {
    const targetPage = document.getElementById(page + 'Page');
    if (!targetPage) return;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    targetPage.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    if (page === 'report') renderManagementLists();
    if (page === 'compare') renderCompareTable();
}

function toggleSection(header) {
    const content = header.nextElementSibling;
    const toggle = header.querySelector('.toggle');
    content.classList.toggle('open');
    toggle.classList.toggle('open');
}

// =====================================================
// 3220 COMPLIANCE RENDERING
// =====================================================

function renderComplianceSections() {
    const container = document.getElementById('complianceSections');
    ensureComplianceFacilityTypeSelection();
    const openSectionIds = getOpenSectionIds('complianceSections');
    const scrollY = window.scrollY;
    container.innerHTML = '';

    COMPLIANCE_DATA_3220.sections.forEach(section => {
        const sectionId = String(section.id);
        const sectionCard = document.createElement('div');
        sectionCard.className = 'section-card';
        sectionCard.dataset.sectionId = sectionId;

        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'section-header';
        sectionHeader.onclick = () => toggleSection(sectionHeader);
        sectionHeader.innerHTML = `
            <h3>${section.name[currentLang]}</h3>
            <span class="toggle">▼</span>
        `;

        const sectionContent = document.createElement('div');
        sectionContent.className = 'section-content';
        if (openSectionIds.has(sectionId)) {
            sectionContent.classList.add('open');
            sectionHeader.querySelector('.toggle').classList.add('open');
        }

        section.requirements.forEach(req => {
            const item = renderComplianceRequirement(req);
            sectionContent.appendChild(item);
        });

        sectionCard.appendChild(sectionHeader);
        sectionCard.appendChild(sectionContent);
        container.appendChild(sectionCard);
    });

    window.scrollTo(0, scrollY);
}

function renderComplianceRequirement(req) {
    const div = document.createElement('div');
    const status = complianceAnswers[req.id] || '';
    const isMandatory = isComplianceRequirementMandatory(req);
    const titleText = (req.title && (req.title[currentLang] || req.title.en)) || '';

    let itemClass = 'criterion-item';
    if (isMandatory) itemClass += ' mandatory';
    if (status === 'yes') itemClass += ' fulfilled';
    if (status === 'no') itemClass += ' not-fulfilled';

    div.className = itemClass;

    // Prevent click propagation on the entire item
    div.onclick = (e) => e.stopPropagation();

    div.innerHTML = `
        <div class="criterion-header">
            <div class="criterion-info">
                <span class="criterion-id">${req.id}</span>
                ${isMandatory ? `<span class="mandatory-badge">${t('mandatory').toUpperCase()}</span>` : `<span class="optional-badge">${t('optional').toUpperCase()}</span>`}
                <div class="criterion-title">${titleText}</div>
            </div>
        </div>
        <div class="assessment-controls">
            <button class="status-btn yes ${status === 'yes' ? 'active' : ''}" data-req-id="${req.id}" data-status="yes">✓ ${t('yes')}</button>
            <button class="status-btn no ${status === 'no' ? 'active' : ''}" data-req-id="${req.id}" data-status="no">✗ ${t('no')}</button>
            <button class="status-btn na ${status === 'na' ? 'active' : ''}" data-req-id="${req.id}" data-status="na">${t('na')}</button>
        </div>
    `;

    // Add event listeners to buttons
    const buttons = div.querySelectorAll('.status-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const reqId = btn.getAttribute('data-req-id');
            const newStatus = btn.getAttribute('data-status');
            setComplianceStatus(reqId, newStatus);
        });
    });

    return div;
}

function setComplianceStatus(id, status) {
    if (complianceAnswers[id] === status) {
        delete complianceAnswers[id];
    } else {
        complianceAnswers[id] = status;
    }
    renderComplianceSections();
    updateStats();
}

// =====================================================
// 3296 CLASSIFICATION RENDERING
// =====================================================

function renderClassificationCriteria() {
    const container = document.getElementById('classificationSections');
    const openSectionIds = getOpenSectionIds('classificationSections');
    const scrollY = window.scrollY;
    container.innerHTML = '';

    const currentStarLevel = getStarLevel(selectedStar) || CLASSIFICATION_DATA_3296.starLevels[0];
    const mandatorySet = new Set(getMandatoryIdsForLevel(currentStarLevel));
    const activeCriteriaIds = getAssessableCriterionIdSet(currentStarLevel.star);
    const showMandatoryOnly = isFilterActive('filterMandatoryBtn');
    const showMissingOnly = isFilterActive('filterMissingBtn');
    const searchTerm = (document.getElementById('classificationSearch')?.value || '').trim().toLowerCase();
    const categoryFilter = document.getElementById('classificationCategoryFilter')?.value || '';
    const hideChecked = Boolean(document.getElementById('classificationHideChecked')?.checked);

    CLASSIFICATION_DATA_3296.sections.forEach(section => {
        if (categoryFilter && String(section.id) !== String(categoryFilter)) return;

        const sectionId = String(section.id);
        const sectionCard = document.createElement('div');
        sectionCard.className = 'section-card';
        sectionCard.dataset.sectionId = sectionId;

        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'section-header';
        sectionHeader.onclick = () => toggleSection(sectionHeader);
        sectionHeader.innerHTML = `
            <h3>${section.name[currentLang]}</h3>
            <span class="toggle">▼</span>
        `;

        const sectionContent = document.createElement('div');
        sectionContent.className = 'section-content';
        if (openSectionIds.has(sectionId)) {
            sectionContent.classList.add('open');
            sectionHeader.querySelector('.toggle').classList.add('open');
        }

        const rows = [];
        let currentGroupHeader = null;
        (section.criteria || []).forEach(criterion => {
            if (!isAssessableClassificationCriterion(criterion)) {
                if (criterion.isGroupHeader) {
                    currentGroupHeader = criterion;
                }
                return;
            }
            if (!activeCriteriaIds.has(String(criterion.id))) return;
            const title = (criterion.title && (criterion.title[currentLang] || criterion.title.en)) || '';
            if (searchTerm && !title.toLowerCase().includes(searchTerm) && !String(criterion.id).toLowerCase().includes(searchTerm)) {
                return;
            }
            if (hideChecked && classificationAnswers[criterion.id]) return;
            if (showMandatoryOnly && !mandatorySet.has(String(criterion.id))) return;
            if (showMissingOnly) {
                const status = classificationAnswers[criterion.id];
                if (status !== 'no' && status) return;
            }
            rows.push({
                criterion,
                groupHeader: currentGroupHeader
            });
        });
        if (!rows.length) return;

        let lastHeaderId = null;
        rows.forEach(row => {
            const criterion = row.criterion;
            const header = row.groupHeader;
            const headerId = header ? String(header.id) : null;

            if (header && headerId !== lastHeaderId) {
                const headerTitle = (header.title && (header.title[currentLang] || header.title.en)) || '';
                const headerNode = document.createElement('div');
                headerNode.className = 'criterion-group-header';
                headerNode.innerHTML = `
                    <div style="font-size:11px;color:var(--gray-600);font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:8px 2px 4px;border-bottom:1px solid var(--gray-200);margin:4px 0 8px">
                        #${escapeHtml(header.id)} ${escapeHtml(headerTitle)}
                    </div>
                `;
                sectionContent.appendChild(headerNode);
                lastHeaderId = headerId;
            }

            const isMandatory = mandatorySet.has(String(criterion.id));
            const item = renderClassificationCriterion(criterion, isMandatory);
            sectionContent.appendChild(item);
        });

        sectionCard.appendChild(sectionHeader);
        sectionCard.appendChild(sectionContent);
        container.appendChild(sectionCard);
    });

    if (!container.innerHTML) {
        container.innerHTML = `<p style="color:var(--gray-500);font-size:12px">${t('noItems')}</p>`;
    }

    window.scrollTo(0, scrollY);
}

function renderClassificationCriterion(criterion, isMandatory) {
    const div = document.createElement('div');
    const status = classificationAnswers[criterion.id] || '';
    const evidence = evidenceData[criterion.id] || [];
    const titleText = (criterion.title && (criterion.title[currentLang] || criterion.title.en)) || '';
    const isPerUnit = isPerUnitCriterion(criterion);
    const quantity = getCriterionQuantity(criterion.id);
    const maxPoints = getCriterionMaxPoints(criterion);
    const earnedPoints = getCriterionEarnedPoints(criterion);
    const pointsBadgeText = isPerUnit
        ? `${earnedPoints}/${maxPoints} ${t('pointsLabel')}`
        : `${criterion.points} ${t('pointsLabel')}`;
    const referenceCodes = Array.isArray(criterion.referenceCodes)
        ? criterion.referenceCodes
        : normalizeReferenceCodes(criterion.reference || '');
    const referencesHtml = referenceCodes.length
        ? `
            <div class="criterion-reference" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
                ${referenceCodes.map(code => {
                    const annotationText = getAnnotationText(code);
                    const tooltip = annotationText ? escapeHtml(`${code}: ${annotationText}`) : escapeHtml(code);
                    return `<span title="${tooltip}" style="font-size:10px;padding:2px 6px;border:1px solid var(--gray-300);border-radius:999px;background:var(--gray-50);color:var(--gray-600);cursor:help">${escapeHtml(code)}</span>`;
                }).join('')}
            </div>
        `
        : '';
    const perUnitDetails = isPerUnit
        ? `
            <div class="per-unit-box" style="margin-top:10px;padding:8px 10px;border:1px solid var(--gray-200);border-radius:8px;background:var(--gray-50)">
                <div style="font-size:11px;color:var(--gray-600);margin-bottom:6px">
                    ${criterion.scoringRule.pointsPerUnit} × ${escapeHtml(criterion.scoringRule.unit?.[currentLang] || criterion.scoringRule.unit?.en || t('unitLabel'))}
                    (${t('maxLabel')}: ${maxPoints} ${t('pointsLabel')})
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <label for="qty-${criterion.id}" style="font-size:12px;color:var(--gray-700)">${t('quantityLabel')}</label>
                    <input
                        id="qty-${criterion.id}"
                        class="quantity-input"
                        data-crit-id="${criterion.id}"
                        type="number"
                        min="0"
                        step="1"
                        value="${quantity}"
                        ${status === 'yes' ? '' : 'disabled'}
                        style="width:90px;padding:6px 8px;border:1px solid var(--gray-300);border-radius:6px;font-size:12px;background:#fff"
                    />
                    <span style="font-size:12px;color:var(--gray-700)">
                        ${t('scoreLabel')}: <strong>${earnedPoints}</strong> / ${maxPoints}
                    </span>
                </div>
            </div>
        `
        : '';

    let itemClass = 'criterion-item';
    if (isMandatory) itemClass += ' mandatory';
    if (status === 'yes') itemClass += ' fulfilled';
    if (status === 'no') itemClass += ' not-fulfilled';

    div.className = itemClass;

    // Prevent click propagation on the entire item
    div.onclick = (e) => e.stopPropagation();

    div.innerHTML = `
        <div class="criterion-header">
            <div class="criterion-info">
                <span class="criterion-id">#${criterion.id}</span>
                ${isMandatory ? `<span class="mandatory-badge">${t('mandatory').toUpperCase()}</span>` : ''}
                <div class="criterion-title">${titleText}</div>
                ${referencesHtml}
            </div>
            <div class="criterion-badges">
                <span class="points-badge">${pointsBadgeText}</span>
            </div>
        </div>
        <div class="assessment-controls">
            <button class="status-btn yes ${status === 'yes' ? 'active' : ''}" data-crit-id="${criterion.id}" data-status="yes">✓ ${t('yes')}</button>
            <button class="status-btn no ${status === 'no' ? 'active' : ''}" data-crit-id="${criterion.id}" data-status="no">✗ ${t('no')}</button>
            <button class="status-btn na ${status === 'na' ? 'active' : ''}" data-crit-id="${criterion.id}" data-status="na">${t('na')}</button>
        </div>
        ${perUnitDetails}
        <div class="evidence-section">
            <div class="evidence-title">📎 ${t('evidenceTitle')}</div>
            <div class="evidence-buttons">
                <button class="evidence-btn ${evidence.some(e => e.type === 'photo') ? 'has-file' : ''}" data-crit-id="${criterion.id}" data-evidence="photo">📷 ${t('photoLabel')}</button>
                <button class="evidence-btn ${evidence.some(e => e.type === 'video') ? 'has-file' : ''}" data-crit-id="${criterion.id}" data-evidence="video">🎥 ${t('videoLabel')}</button>
                <button class="evidence-btn ${evidence.some(e => e.type === 'document') ? 'has-file' : ''}" data-crit-id="${criterion.id}" data-evidence="document">📄 ${t('documentLabel')}</button>
            </div>
            ${evidence.length ? `
                <div class="evidence-list">
                    ${evidence.map((item, index) => `
                        <span class="evidence-item">
                            ${item.name}
                            <span class="remove" data-crit-id="${criterion.id}" data-index="${index}">×</span>
                        </span>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;

    // Add event listeners to buttons
    const buttons = div.querySelectorAll('.status-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const critId = btn.getAttribute('data-crit-id');
            const newStatus = btn.getAttribute('data-status');
            setClassificationStatus(critId, newStatus);
        });
    });

    const evidenceButtons = div.querySelectorAll('.evidence-btn');
    evidenceButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const critId = btn.getAttribute('data-crit-id');
            const type = btn.getAttribute('data-evidence');
            uploadEvidence(critId, type);
        });
    });

    const removeButtons = div.querySelectorAll('.evidence-item .remove');
    removeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const critId = btn.getAttribute('data-crit-id');
            const index = Number(btn.getAttribute('data-index'));
            removeEvidence(critId, index);
        });
    });

    const quantityInput = div.querySelector('.quantity-input');
    if (quantityInput) {
        quantityInput.addEventListener('input', (e) => {
            e.stopPropagation();
            const critId = quantityInput.getAttribute('data-crit-id');
            setClassificationQuantity(critId, quantityInput.value);
        });
    }

    return div;
}

function setClassificationStatus(id, status) {
    const criterionId = String(id);
    const criterion = getCriterionById(criterionId);
    if (classificationAnswers[criterionId] === status) {
        delete classificationAnswers[criterionId];
    } else {
        classificationAnswers[criterionId] = status;
    }

    if (criterion && isPerUnitCriterion(criterion)) {
        const currentQuantity = getCriterionQuantity(criterionId);
        if (classificationAnswers[criterionId] === 'yes' && currentQuantity <= 0) {
            classificationQuantities[criterionId] = 1;
        } else if (classificationAnswers[criterionId] !== 'yes' && currentQuantity <= 0) {
            delete classificationQuantities[criterionId];
        }
    }
    renderClassificationCriteria();
    updateStats();
}

function uploadEvidence(criterionId, type) {
    currentUpload = { mode: 'criterion', id: criterionId, type };
    const input = document.getElementById(type + 'Input');
    if (input) input.click();
}

function removeEvidence(criterionId, index) {
    if (!evidenceData[criterionId]) return;
    evidenceData[criterionId].splice(index, 1);
    if (evidenceData[criterionId].length === 0) {
        delete evidenceData[criterionId];
    }
    renderClassificationCriteria();
    updateStats();
}

// =====================================================
// STATISTICS UPDATE
// =====================================================

function updateStats() {
    // 3220 Compliance
    const complianceResult = evaluate3220();
    const complianceStatusEl = document.getElementById('complianceStatus');
    if (complianceStatusEl) {
        complianceStatusEl.textContent = complianceResult.compliant ? t('reportCompliant') : t('reportNotCompliant');
        complianceStatusEl.style.color = complianceResult.compliant ? 'var(--success)' : 'var(--danger)';
    }

    // 3296 Classification
    let totalPoints = 0;
    let fulfilled = 0;
    let missing = 0;
    let assessed = 0;
    const activeCriteriaIds = getAssessableCriterionIdSet(selectedStar);

    CLASSIFICATION_DATA_3296.sections.forEach(section => {
        section.criteria.forEach(criterion => {
            if (!isAssessableClassificationCriterion(criterion)) return;
            if (!activeCriteriaIds.has(String(criterion.id))) return;
            const status = classificationAnswers[criterion.id];
            if (status === 'yes') {
                totalPoints += getCriterionEarnedPoints(criterion);
                fulfilled++;
                assessed++;
            } else if (status === 'no') {
                missing++;
                assessed++;
            } else if (status === 'na') {
                assessed++;
            }
        });
    });

    const totalPointsEl = document.getElementById('totalPoints');
    const fulfilledCountEl = document.getElementById('fulfilledCount');
    const missingCountEl = document.getElementById('missingCount');
    if (totalPointsEl) totalPointsEl.textContent = totalPoints;
    if (fulfilledCountEl) fulfilledCountEl.textContent = fulfilled;
    if (missingCountEl) missingCountEl.textContent = missing;

    const totalCriteriaCount = getTotalClassificationCriteriaCount();
    const maxPointsForSelectedStar = getMaxPointsForStar(selectedStar);
    const assessedCountEl = document.getElementById('assessedCount');
    const totalCriteriaEl = document.getElementById('totalCriteria');
    const currentPointsEl = document.getElementById('currentPoints');
    const maxPointsEl = document.getElementById('maxPoints');
    const progressFillEl = document.getElementById('progressFill');
    if (assessedCountEl) assessedCountEl.textContent = assessed;
    if (totalCriteriaEl) totalCriteriaEl.textContent = totalCriteriaCount;
    if (currentPointsEl) currentPointsEl.textContent = totalPoints;
    if (maxPointsEl) maxPointsEl.textContent = maxPointsForSelectedStar;
    if (progressFillEl) {
        const pct = totalCriteriaCount ? (assessed / totalCriteriaCount) * 100 : 0;
        progressFillEl.style.width = `${pct.toFixed(1)}%`;
    }

    const currentStarLevel = CLASSIFICATION_DATA_3296.starLevels.find(l => l.star === selectedStar);
    const mandatoryStatusEl = document.getElementById('mandatoryStatus');
    if (currentStarLevel && mandatoryStatusEl) {
        const mandatoryIds = getMandatoryIdsForLevel(currentStarLevel);
        const fulfilledMandatory = mandatoryIds.filter(id => {
            return isMandatoryCriterionIdSatisfied(id);
        }).length;
        mandatoryStatusEl.textContent = `${fulfilledMandatory}/${mandatoryIds.length}`;
    }

    const evidenceCountEl = document.getElementById('evidenceCount');
    if (evidenceCountEl) evidenceCountEl.textContent = getEvidenceCount();

    updateAssessmentPanel();
    updateDashboardStats();
    persistWorkingState();
}

function handleFileUpload(event) {
    if (!currentUpload) return;
    const files = Array.from(event.target.files || []);
    if (!files.length) {
        event.target.value = '';
        currentUpload = null;
        return;
    }

    if (currentUpload.mode === 'criterion') {
        if (!evidenceData[currentUpload.id]) evidenceData[currentUpload.id] = [];
        files.forEach(file => {
            evidenceData[currentUpload.id].push({ name: file.name, type: currentUpload.type });
        });
        renderClassificationCriteria();
        updateStats();
    } else if (currentUpload.mode === 'resolution') {
        const resolution = resolutions.find(r => r.id === currentUpload.id);
        if (resolution) {
            if (!resolution.evidence) resolution.evidence = [];
            files.forEach(file => {
                resolution.evidence.push({ name: file.name, type: currentUpload.type });
            });
            renderResolutions();
        }
    }

    event.target.value = '';
    currentUpload = null;
    persistWorkingState();
}

// =====================================================
// EVALUATION ALGORITHMS
// =====================================================

function evaluate3220() {
    ensureComplianceFacilityTypeSelection();
    let compliant = true;
    const failedRequirements = [];

    COMPLIANCE_DATA_3220.sections.forEach(section => {
        section.requirements.forEach(req => {
            if (!isComplianceRequirementMandatory(req)) return;
            const status = complianceAnswers[req.id];
            // For mandatory requirements: must be 'yes' or 'na' (if not applicable)
            // If no answer or 'no', it fails
            if (status !== 'yes' && status !== 'na') {
                compliant = false;
                failedRequirements.push(req);
            }
        });
    });

    return {
        compliant,
        failedRequirements
    };
}

function evaluate3296() {
    const currentStarLevel = getStarLevel(selectedStar);
    if (!currentStarLevel) {
        return { achieved: false, reason: 'invalid_star', star: 0, points: 0, required: 0 };
    }
    const requiredPoints = getMinPointsForStar(selectedStar);
    const activeCriteriaIds = getAssessableCriterionIdSet(selectedStar);

    // Step 1: Calculate total points
    let totalPoints = 0;
    CLASSIFICATION_DATA_3296.sections.forEach(section => {
        section.criteria.forEach(criterion => {
            if (!isAssessableClassificationCriterion(criterion)) return;
            if (!activeCriteriaIds.has(String(criterion.id))) return;
            totalPoints += getCriterionEarnedPoints(criterion);
        });
    });

    // Step 2: Check all mandatory criteria
    const failedMandatory = [];
    for (const mandatoryId of getMandatoryIdsForLevel(currentStarLevel)) {
        if (!isMandatoryCriterionIdSatisfied(mandatoryId)) {
            failedMandatory.push(mandatoryId);
        }
    }

    if (failedMandatory.length > 0) {
        return {
            achieved: false,
            reason: 'mandatory_failure',
            failedMandatory,
            star: 0,
            points: totalPoints
        };
    }

    // Step 3: Check threshold
    if (totalPoints >= requiredPoints) {
        return {
            achieved: true,
            star: selectedStar,
            points: totalPoints
        };
    }

    return {
        achieved: false,
        reason: 'insufficient_points',
        star: 0,
        points: totalPoints,
        required: requiredPoints
    };
}

function getClassificationPointsBreakdown() {
    const currentStarLevel = getStarLevel(selectedStar);
    if (!currentStarLevel) {
        return {
            mandatoryPointsAchieved: 0,
            optionalPointsAchieved: 0,
            mandatoryPointsRequired: 0,
            optionalPointsRequired: 0
        };
    }
    const mandatorySet = new Set(getMandatoryIdsForLevel(currentStarLevel));
    const activeCriteriaIds = getAssessableCriterionIdSet(selectedStar);
    let mandatoryPointsAchieved = 0;
    let optionalPointsAchieved = 0;
    let mandatoryPointsRequired = 0;

    CLASSIFICATION_DATA_3296.sections.forEach(section => {
        section.criteria.forEach(criterion => {
            if (!isAssessableClassificationCriterion(criterion)) return;
            if (!activeCriteriaIds.has(String(criterion.id))) return;
            const earnedPoints = getCriterionEarnedPoints(criterion);
            if (mandatorySet.has(criterion.id)) {
                mandatoryPointsRequired += getCriterionMaxPoints(criterion);
                mandatoryPointsAchieved += earnedPoints;
            } else {
                optionalPointsAchieved += earnedPoints;
            }
        });
    });

    const optionalPointsRequired = Math.max(0, getMinPointsForStar(selectedStar) - mandatoryPointsRequired);
    return {
        mandatoryPointsAchieved,
        optionalPointsAchieved,
        mandatoryPointsRequired,
        optionalPointsRequired
    };
}

function hasRequiredAssessmentData() {
    const requiredFields = ['hotelName', 'hotelAddress', 'roomCount', 'assessmentDate', 'contactName', 'contactPhone', 'contactEmail'];
    return requiredFields.every(field => {
        const value = assessmentData[field];
        return typeof value === 'string' ? value.trim() !== '' : Boolean(value);
    });
}

// =====================================================
// REPORT GENERATION
// =====================================================

function generateReport() {
    if (!hasRequiredAssessmentData()) {
        showToast(t('assessmentRequiredFields'), 'error');
        openAssessmentWindow();
        return;
    }

    const hotelName = assessmentData.hotelName || 'Hotel Name';
    const address = assessmentData.hotelAddress || 'Address';
    const rooms = assessmentData.roomCount || '0';
    const date = assessmentData.assessmentDate || new Date().toISOString().split('T')[0];
    const contactName = assessmentData.contactName || '—';
    const contactPhone = assessmentData.contactPhone || '—';
    const contactEmail = assessmentData.contactEmail || '—';

    const complianceResult = evaluate3220();
    const classificationResult = evaluate3296();
    const pointsBreakdown = getClassificationPointsBreakdown();
    const classificationMaxPoints = getMaxPointsForStar(selectedStar);
    const mailTo = contactEmail ? `mailto:${contactEmail}` : 'mailto:';
    const assessmentRecord = createAssessmentRecord();
    const reportId = createId('report');
    const complianceStatusText = complianceResult.compliant ? t('reportCompliant') : t('reportNotCompliant');
    const complianceMessage = complianceResult.compliant
        ? t('reportAllMandatoryMet')
        : t('reportFailedRequirements').replace('{count}', complianceResult.failedRequirements.length);
    const classificationTitle = classificationResult.achieved
        ? t('reportClassificationAchieved').replace('{star}', classificationResult.star)
        : t('reportClassificationNotAchieved');
    const resolutionButtonHtml = isMasterUser()
        ? `<button class="btn btn-warning" onclick="if (window.opener && window.opener.sendToResolution) { window.opener.sendToResolution(); } else if (typeof sendToResolution === 'function') { sendToResolution(); }">📝 ${t('sendToResolution')}</button>`
        : '';

    let reportHTML = `
        <div class="report-header">
            <h1>${t('reportTitle')}</h1>
            <p class="standard">${t('reportStandard')}</p>
        </div>

        <div class="report-hotel-info">
            <div class="info-item">
                <label>${t('reportHotelName')}</label>
                <span>${hotelName}</span>
            </div>
            <div class="info-item">
                <label>${t('reportAddress')}</label>
                <span>${address}</span>
            </div>
            <div class="info-item">
                <label>${t('reportRooms')}</label>
                <span>${rooms}</span>
            </div>
            <div class="info-item">
                <label>${t('reportDate')}</label>
                <span>${date}</span>
            </div>
            <div class="info-item">
                <label>${t('contactPerson')}</label>
                <span>${contactName}</span>
            </div>
            <div class="info-item">
                <label>${t('phone')}</label>
                <span>${contactPhone}</span>
            </div>
            <div class="info-item">
                <label>${t('email')}</label>
                <span>${contactEmail}</span>
            </div>
            <div class="info-item">
                <label>${t('reportInspector')}</label>
                <span>${currentUser ? currentUser.fullName : t('roleInspector')}</span>
            </div>
            <div class="info-item">
                <label>${t('reportTarget')}</label>
                <span>${'★'.repeat(selectedStar)}</span>
            </div>
        </div>

        <div class="compliance-status ${complianceResult.compliant ? 'compliant' : 'non-compliant'}">
            <h3>O'z DSt 3220:2023 - ${complianceStatusText}</h3>
            <p>${complianceMessage}</p>
            ${!complianceResult.compliant && complianceResult.failedRequirements.length > 0 ? `
                <div class="legal-warning">
                    <strong>⚠️ ${t('legalStatusTitle')}:</strong> ${t('legalStatusText')}
                </div>
            ` : ''}
        </div>

        <div class="report-result">
            <div class="stars">${classificationResult.achieved ? '★'.repeat(classificationResult.star) : '—'}</div>
            <h2>${classificationTitle}</h2>
            <p class="score">${classificationResult.points} / ${classificationMaxPoints} ${t('pointsLabel')}</p>
        </div>

        <div class="report-summary">
            <div class="summary-item blue">
                <div class="label">${t('mandatoryPointsAchieved')}</div>
                <div class="value">${pointsBreakdown.mandatoryPointsAchieved}</div>
            </div>
            <div class="summary-item green">
                <div class="label">${t('optionalPointsAchieved')}</div>
                <div class="value">${pointsBreakdown.optionalPointsAchieved}</div>
            </div>
            <div class="summary-item orange">
                <div class="label">${t('mandatoryPointsRequired')}</div>
                <div class="value">${pointsBreakdown.mandatoryPointsRequired}</div>
            </div>
            <div class="summary-item red">
                <div class="label">${t('optionalPointsRequired')}</div>
                <div class="value">${pointsBreakdown.optionalPointsRequired}</div>
            </div>
        </div>

        ${!complianceResult.compliant ? `
            <div class="legal-warning">
                <strong>⚠️ ${t('reportImportant')}</strong> ${t('reportTechnicalOnly')}
            </div>
        ` : ''}

        ${!classificationResult.achieved && classificationResult.reason === 'mandatory_failure' ? `
            <div class="missing-section">
                <h3>❌ ${t('reportFailedMandatoryTitle').replace('{star}', selectedStar)}</h3>
                ${classificationResult.failedMandatory.map(id => {
                    let criterion = null;
                    CLASSIFICATION_DATA_3296.sections.forEach(s => {
                        const found = s.criteria.find(c => c.id === id);
                        if (found) criterion = found;
                    });
                    return criterion ? `
                        <div class="missing-item">
                            <span class="name">#${criterion.id} - ${criterion.title[currentLang]}</span>
                            <span class="pts">${getCriterionMaxPoints(criterion)} pts</span>
                        </div>
                    ` : '';
                }).join('')}
            </div>
        ` : ''}

        ${!classificationResult.achieved && classificationResult.reason === 'insufficient_points' ? `
            <div class="missing-section">
                <h3>⚠️ ${t('reportInsufficientPoints')}</h3>
                <p style="padding:15px;background:var(--gray-50);border-radius:8px">
                    ${t('reportTotalPoints')} <strong>${classificationResult.points}</strong><br>
                    ${t('reportRequired')} <strong>${classificationResult.required}</strong><br>
                    ${t('reportShortfall')} <strong>${classificationResult.required - classificationResult.points}</strong> ${t('pointsLabel')}
                </p>
            </div>
        ` : ''}

        <div class="report-actions">
            <a class="btn btn-secondary" href="${mailTo}?subject=Hotel%20Assessment%20Report">📧 ${t('emailAction')}</a>
            <button class="btn btn-primary" onclick="window.print()">🖨️ ${t('printAction')}</button>
            <button class="btn btn-success" onclick="window.print()">💾 ${t('savePdfAction')}</button>
            ${resolutionButtonHtml}
        </div>
    `;

    const reportContent = document.getElementById('reportContent');
    if (reportContent) reportContent.innerHTML = reportHTML;
    showPage('report');

    saveAssessmentRecord(assessmentRecord);
    saveReportRecord({
        id: reportId,
        html: reportHTML,
        hotelName,
        createdAt: new Date().toISOString(),
        createdBy: currentUser ? currentUser.username : 'unknown'
    });
    renderManagementLists();

    const reportWin = window.open('', '_blank', 'width=1000,height=750');
    if (!reportWin) {
        showToast(t('popupBlocked'), 'error');
        return;
    }
    reportWin.document.write(buildReportWindowHtml(reportHTML));
    reportWin.document.close();
}

function buildReportWindowHtml(reportBodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t('reportTitle')}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Tahoma, sans-serif; background: #f8fafc; color: #111827; }
    .report-container { background: #fff; border-radius: 15px; padding: 32px; max-width: 900px; margin: 30px auto; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
    .report-header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; margin-bottom: 20px; }
    .report-header h1 { font-size: 22px; color: #1f2937; margin-bottom: 5px; }
    .report-header .standard { color: #6b7280; font-size: 12px; }
    .report-hotel-info { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 16px; background: #f9fafb; border-radius: 10px; margin-bottom: 20px; }
    .info-item label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 4px; }
    .info-item span { font-size: 13px; font-weight: 600; color: #1f2937; }
    .report-result { text-align: center; padding: 24px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px; margin-bottom: 20px; }
    .report-result .stars { font-size: 36px; color: #f59e0b; margin-bottom: 8px; }
    .report-result h2 { font-size: 20px; color: #1f2937; margin-bottom: 6px; }
    .report-result .score { font-size: 14px; color: #4b5563; }
    .compliance-status { padding: 16px; border-radius: 10px; margin-bottom: 20px; border: 2px solid; }
    .compliance-status.compliant { background: #f0fdf4; border-color: #16a34a; }
    .compliance-status.non-compliant { background: #fef2f2; border-color: #dc2626; }
    .compliance-status h3 { font-size: 14px; margin-bottom: 8px; }
    .compliance-status.compliant h3 { color: #16a34a; }
    .compliance-status.non-compliant h3 { color: #dc2626; }
    .legal-warning { background: #fff3cd; border: 2px solid #d97706; padding: 12px; border-radius: 8px; margin-top: 12px; font-size: 12px; color: #1f2937; }
    .report-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .summary-item { background: #f9fafb; padding: 12px; border-radius: 10px; text-align: center; }
    .summary-item .label { font-size: 10px; color: #6b7280; margin-bottom: 4px; }
    .summary-item .value { font-size: 18px; font-weight: 700; }
    .summary-item.green .value { color: #16a34a; }
    .summary-item.red .value { color: #dc2626; }
    .summary-item.orange .value { color: #d97706; }
    .summary-item.blue .value { color: #1e40af; }
    .missing-section { margin-bottom: 20px; }
    .missing-section h3 { font-size: 14px; color: #1f2937; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
    .missing-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #fef2f2; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid #dc2626; gap: 10px; }
    .missing-item .name { font-size: 12px; color: #374151; flex: 1; }
    .missing-item .pts { font-size: 11px; font-weight: 600; color: #dc2626; }
    .report-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
    .btn { padding: 10px 18px; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
    .btn-primary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: #fff; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-success { background: #16a34a; color: #fff; }
    .btn-warning { background: #d97706; color: #fff; }
    @media (max-width: 768px) {
        .report-container { padding: 20px; margin: 20px; }
        .report-hotel-info { grid-template-columns: 1fr; }
        .report-summary { grid-template-columns: repeat(2, 1fr); }
    }
</style>
</head>
<body>
    <div class="report-container">
        ${reportBodyHtml}
    </div>
</body>
</html>`;
}

function buildAssessmentWindowHtml(data) {
    const payload = JSON.stringify(data || {});
    const scriptClose = '</scr' + 'ipt>';
    const lang = currentLang || 'en';
    const text = UI_TEXT[lang] || UI_TEXT.en;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${text.assessmentTitle}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
        --primary: #0b2e59;
        --primary-light: #1f4d8b;
        --success: #1f7a45;
        --gray-50: #f8fafc;
        --gray-200: #e2e8f0;
        --gray-500: #64748b;
        --gray-700: #334155;
        --gray-800: #1f2937;
    }
    body {
        font-family: "Segoe UI", Tahoma, sans-serif;
        background-color: #eef2f6;
        background-image:
            linear-gradient(180deg, #f8fafc 0%, #eef2f6 100%),
            repeating-linear-gradient(0deg, rgba(11,46,89,.04) 0 1px, transparent 1px 12px);
        color: var(--gray-800);
    }
    .container { max-width: 900px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 16px; color: var(--primary); }
    .section-card {
        background: #fff;
        border-radius: 12px;
        margin-bottom: 16px;
        border: 1px solid var(--gray-200);
        box-shadow: 0 2px 8px rgba(15, 23, 42, .06);
        overflow: hidden;
    }
    .section-header { background: var(--primary); color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
    .section-header h3 { font-size: 14px; }
    .toggle { font-size: 16px; transition: transform .2s; }
    .toggle.open { transform: rotate(180deg); }
    .section-content { padding: 16px; display: none; }
    .section-content.open { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    .form-group label { display: block; margin-bottom: 6px; color: var(--gray-700); font-weight: 600; font-size: 13px; }
    .required-mark { color: #b91c1c; font-weight: 700; margin-left: 4px; }
    .form-group input { width: 100%; padding: 10px 12px; border: 1.5px solid var(--gray-200); border-radius: 10px; font-size: 14px; }
    .form-group input:focus { outline: none; border-color: var(--primary-light); box-shadow: 0 0 0 3px rgba(31,77,139,.12); }
    .form-group input.invalid { border-color: #b91c1c; background: #fff1f2; }
    .validation-message {
        display: none;
        margin-top: 8px;
        margin-bottom: 2px;
        font-size: 12px;
        color: #b91c1c;
        font-weight: 600;
    }
    .validation-message.active { display: block; }
    .actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
    .btn { padding: 10px 20px; border: none; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: var(--primary-light); }
    .btn-success { background: var(--success); color: #fff; }
</style>
</head>
<body>
    <div class="container">
        <h1>${text.assessmentTitle}</h1>
        <div class="section-card">
            <div class="section-header" onclick="toggleSection(this)">
                <h3>🏨 ${text.hotelInfo}</h3>
                <span class="toggle open">▼</span>
            </div>
            <div class="section-content open">
                <div class="grid">
                    <div class="form-group">
                        <label>${text.hotelName}<span class="required-mark">*</span></label>
                        <input type="text" id="hotelName" placeholder="${text.hotelName}" required>
                    </div>
                    <div class="form-group">
                        <label>${text.address}<span class="required-mark">*</span></label>
                        <input type="text" id="hotelAddress" placeholder="${text.address}" required>
                    </div>
                    <div class="form-group">
                        <label>${text.roomCount}<span class="required-mark">*</span></label>
                        <input type="number" id="roomCount" min="1" placeholder="${text.roomCount}" required>
                    </div>
                    <div class="form-group">
                        <label>${text.assessmentDate}<span class="required-mark">*</span></label>
                        <input type="date" id="assessmentDate" required>
                    </div>
                </div>
            </div>
        </div>
        <div class="section-card">
            <div class="section-header" onclick="toggleSection(this)">
                <h3>📞 ${text.contactDetails}</h3>
                <span class="toggle open">▼</span>
            </div>
            <div class="section-content open">
                <div class="grid">
                    <div class="form-group">
                        <label>${text.contactPerson}<span class="required-mark">*</span></label>
                        <input type="text" id="contactName" placeholder="${text.contactPerson}" required>
                    </div>
                    <div class="form-group">
                        <label>${text.phone}<span class="required-mark">*</span></label>
                        <input type="tel" id="contactPhone" placeholder="${text.phone}" required>
                    </div>
                    <div class="form-group">
                        <label>${text.email}<span class="required-mark">*</span></label>
                        <input type="email" id="contactEmail" placeholder="${text.email}" required>
                    </div>
                </div>
            </div>
        </div>
        <div class="validation-message" id="assessmentValidationMessage">${text.assessmentRequiredFields || ''}</div>
        <div class="actions">
            <button class="btn btn-primary" onclick="startAssessment('compliance')">${text.start3220}</button>
            <button class="btn btn-success" onclick="startAssessment('classification')">${text.start3296}</button>
        </div>
    </div>
<script>
    const data = ${payload};
    if (!data.assessmentDate) {
        data.assessmentDate = new Date().toISOString().split('T')[0];
    }
    function toggleSection(header) {
        const content = header.nextElementSibling;
        const toggle = header.querySelector('.toggle');
        content.classList.toggle('open');
        toggle.classList.toggle('open');
    }
    function bindField(id, field) {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = data[field] || '';
        input.addEventListener('input', () => {
            input.classList.remove('invalid');
            const validationMessage = document.getElementById('assessmentValidationMessage');
            if (validationMessage) validationMessage.classList.remove('active');
            if (window.opener && window.opener.setAssessmentField) {
                window.opener.setAssessmentField(field, input.value);
            }
        });
    }
    function validateRequiredFields() {
        const requiredIds = ['hotelName', 'hotelAddress', 'roomCount', 'assessmentDate', 'contactName', 'contactPhone', 'contactEmail'];
        let firstInvalid = null;
        requiredIds.forEach(id => {
            const input = document.getElementById(id);
            if (!input) return;
            const value = (input.value || '').trim();
            const isInvalid = !value || (id === 'roomCount' && Number(value) <= 0);
            input.classList.toggle('invalid', isInvalid);
            if (isInvalid && !firstInvalid) firstInvalid = input;
        });
        const validationMessage = document.getElementById('assessmentValidationMessage');
        const isValid = !firstInvalid;
        if (validationMessage) validationMessage.classList.toggle('active', !isValid);
        if (firstInvalid) firstInvalid.focus();
        return isValid;
    }
    function startAssessment(page) {
        if (!validateRequiredFields()) return;
        if (window.opener && window.opener.showPage) {
            window.opener.showPage(page);
            window.opener.focus();
        }
        window.close();
    }
    document.addEventListener('DOMContentLoaded', () => {
        bindField('hotelName', 'hotelName');
        bindField('hotelAddress', 'hotelAddress');
        bindField('roomCount', 'roomCount');
        bindField('assessmentDate', 'assessmentDate');
        bindField('contactName', 'contactName');
        bindField('contactPhone', 'contactPhone');
        bindField('contactEmail', 'contactEmail');
    });
${scriptClose}
</body>
</html>`;
}

// =====================================================
// UTILITIES
// =====================================================

function getOpenSectionIds(containerId) {
    const openSectionIds = new Set();
    const container = document.getElementById(containerId);
    if (!container) return openSectionIds;

    container.querySelectorAll('.section-card').forEach(card => {
        const content = card.querySelector('.section-content');
        if (content && content.classList.contains('open')) {
            const sectionId = card.getAttribute('data-section-id');
            if (sectionId) openSectionIds.add(sectionId);
        }
    });

    return openSectionIds;
}

function populateFilters() {
    const sections = CLASSIFICATION_DATA_3296.sections || [];
    const categoryOptions = sections.map(section => {
        return `<option value="${section.id}">${getSectionTitle(section)}</option>`;
    }).join('');

    const classificationCategory = document.getElementById('classificationCategoryFilter');
    if (classificationCategory) {
        const current = classificationCategory.value;
        classificationCategory.innerHTML = `<option value="">${t('allCategories')}</option>${categoryOptions}`;
        if (current) classificationCategory.value = current;
    }

    const compareCategory = document.getElementById('compareCategoryFilter');
    if (compareCategory) {
        const current = compareCategory.value;
        compareCategory.innerHTML = `<option value="">${t('allCategories')}</option>${categoryOptions}`;
        if (current) compareCategory.value = current;
    }
}

function getSectionTitle(section) {
    if (!section || !section.name) return '';
    return section.name[currentLang] || section.name.en || section.name.uz || section.name.ru || '';
}

function getAccommodationTypes() {
    if (!CLASSIFICATION_DATA_3296 || typeof CLASSIFICATION_DATA_3296 !== 'object') return {};
    if (CLASSIFICATION_DATA_3296.accommodationTypes && typeof CLASSIFICATION_DATA_3296.accommodationTypes === 'object') {
        return CLASSIFICATION_DATA_3296.accommodationTypes;
    }
    return {};
}

function ensureAccommodationTypeSelection() {
    const types = getAccommodationTypes();
    const keys = Object.keys(types);
    if (!keys.length) {
        selectedAccommodationType = 'hotels_and_similar';
        return;
    }
    if (!keys.includes(selectedAccommodationType)) {
        selectedAccommodationType = CLASSIFICATION_DATA_3296.defaultAccommodationType && keys.includes(CLASSIFICATION_DATA_3296.defaultAccommodationType)
            ? CLASSIFICATION_DATA_3296.defaultAccommodationType
            : keys[0];
    }
}

function getAccommodationTypeLabel(type) {
    if (!type) return '';
    return type.name?.[currentLang] || type.name?.en || type.key || '';
}

function getComplianceFacilityTypes() {
    if (!COMPLIANCE_DATA_3220 || typeof COMPLIANCE_DATA_3220 !== 'object') return {};
    if (COMPLIANCE_DATA_3220.facilityTypes && typeof COMPLIANCE_DATA_3220.facilityTypes === 'object') {
        return COMPLIANCE_DATA_3220.facilityTypes;
    }
    return {};
}

function ensureComplianceFacilityTypeSelection() {
    const types = getComplianceFacilityTypes();
    const keys = Object.keys(types);
    if (!keys.length) {
        selectedComplianceFacilityType = 'hotels_and_similar';
        return;
    }
    if (!keys.includes(selectedComplianceFacilityType)) {
        selectedComplianceFacilityType = COMPLIANCE_DATA_3220.defaultFacilityType && keys.includes(COMPLIANCE_DATA_3220.defaultFacilityType)
            ? COMPLIANCE_DATA_3220.defaultFacilityType
            : keys[0];
    }
}

function getComplianceFacilityLabel(value) {
    if (!value) return '';
    return value[currentLang] || value.en || value.uz || value.ru || '';
}

function populateComplianceFacilityTypeOptions() {
    const select = document.getElementById('complianceFacilityTypeSelect');
    if (!select) return;
    ensureComplianceFacilityTypeSelection();
    const types = getComplianceFacilityTypes();
    const keys = Object.keys(types);
    if (!keys.length) {
        select.innerHTML = '';
        select.disabled = true;
        return;
    }
    select.disabled = false;
    select.innerHTML = keys.map(key => {
        const label = getComplianceFacilityLabel(types[key]);
        return `<option value="${key}">${escapeHtml(label)}</option>`;
    }).join('');
    select.value = selectedComplianceFacilityType;
}

function isComplianceRequirementMandatory(req) {
    if (req && req.applicability && typeof req.applicability === 'object') {
        ensureComplianceFacilityTypeSelection();
        return req.applicability[selectedComplianceFacilityType] === '+';
    }
    return Boolean(req && req.mandatory);
}

function getMinPointsForStar(star) {
    ensureAccommodationTypeSelection();
    const types = getAccommodationTypes();
    const selectedType = types[selectedAccommodationType];
    const selectedTypeMin = selectedType?.minScores ? Number(selectedType.minScores[Number(star)]) : NaN;
    if (Number.isFinite(selectedTypeMin)) return selectedTypeMin;

    const starLevel = getStarLevel(star);
    return starLevel ? Number(starLevel.minTotalPoints) || 0 : 0;
}

function populateAccommodationTypeOptions() {
    const select = document.getElementById('accommodationTypeSelect');
    if (!select) return;
    ensureAccommodationTypeSelection();
    const types = getAccommodationTypes();
    const keys = Object.keys(types);
    if (!keys.length) {
        select.innerHTML = '';
        select.disabled = true;
        return;
    }
    select.disabled = false;
    select.innerHTML = keys.map(key => {
        const label = getAccommodationTypeLabel(types[key]);
        return `<option value="${key}">${escapeHtml(label)}</option>`;
    }).join('');
    select.value = selectedAccommodationType;
}

function getStarLevel(star) {
    if (!CLASSIFICATION_DATA_3296 || !Array.isArray(CLASSIFICATION_DATA_3296.starLevels)) return null;
    return CLASSIFICATION_DATA_3296.starLevels.find(level => Number(level.star) === Number(star)) || null;
}

function isAssessableClassificationCriterion(criterion) {
    if (!criterion || typeof criterion !== 'object') return false;
    if (typeof criterion.assessable === 'boolean') return criterion.assessable;
    return !Boolean(criterion.isGroupHeader);
}

function getStrictStarKey(star) {
    const key = String(Number(star));
    return STAR_KEYS.includes(key) ? key : null;
}

function isPerUnitCriterion(criterion) {
    return Boolean(criterion && criterion.scoringRule && criterion.scoringRule.type === 'per_unit');
}

function getCriterionMaxPoints(criterion) {
    if (!criterion) return 0;
    const explicitMax = Number(criterion.maxPoints);
    if (Number.isFinite(explicitMax) && explicitMax >= 0) return explicitMax;
    if (isPerUnitCriterion(criterion)) {
        const ruleMax = Number(criterion.scoringRule.maxPoints);
        if (Number.isFinite(ruleMax) && ruleMax >= 0) return ruleMax;
    }
    return Number(criterion.points) || 0;
}

function getCriterionQuantity(criterionId) {
    return normalizeQuantityValue(classificationQuantities[String(criterionId)]);
}

function getCriterionEarnedPoints(criterion) {
    if (!criterion) return 0;
    if (classificationAnswers[criterion.id] !== 'yes') return 0;
    if (isPerUnitCriterion(criterion)) {
        const quantity = getCriterionQuantity(criterion.id);
        const pointsPerUnit = Number(criterion.scoringRule.pointsPerUnit) || 0;
        const maxPoints = getCriterionMaxPoints(criterion);
        return Math.min(quantity * pointsPerUnit, maxPoints);
    }
    return Number(criterion.points) || 0;
}

function isMandatoryCriterionSatisfied(criterion) {
    if (!criterion) return false;
    const status = classificationAnswers[criterion.id];
    if (status === 'na') return true;
    if (status !== 'yes') return false;
    if (isPerUnitCriterion(criterion)) {
        return getCriterionQuantity(criterion.id) > 0;
    }
    return true;
}

function isMandatoryCriterionIdSatisfied(criterionId) {
    const criterion = getCriterionById(criterionId);
    return isMandatoryCriterionSatisfied(criterion);
}

function setClassificationQuantity(criterionId, rawValue) {
    const id = String(criterionId);
    const quantity = normalizeQuantityValue(rawValue);
    if (quantity > 0) {
        classificationQuantities[id] = quantity;
    } else {
        delete classificationQuantities[id];
    }
    renderClassificationCriteria();
    updateStats();
}

function getAnnotationText(code) {
    if (!CLASSIFICATION_DATA_3296 || !Array.isArray(CLASSIFICATION_DATA_3296.annotations)) return '';
    const target = String(code || '').toUpperCase();
    if (!target) return '';
    const annotation = CLASSIFICATION_DATA_3296.annotations.find(item => String(item.code || '').toUpperCase() === target);
    if (!annotation) return '';
    return annotation[`text_${currentLang}`] || annotation.text_en || annotation.text_uz || annotation.text_ru || '';
}

function isCriterionMandatoryForAccommodationType(criterion, starKey, accommodationType = selectedAccommodationType) {
    if (!criterion || !starKey) return false;
    let isMandatory = criterion?.mandatory?.[starKey] === true;
    const referenceCodes = Array.isArray(criterion.referenceCodes)
        ? criterion.referenceCodes
        : normalizeReferenceCodes(criterion.reference || '');
    const hasCode = code => referenceCodes.includes(code);
    const typeKey = String(accommodationType || '').trim();
    const isAparthotel = typeKey === 'aparthotels';
    const isSpecialized = typeKey === 'specialized';

    // Exemption annotations
    if (isAparthotel && hasCode('A8')) isMandatory = false;
    if (isSpecialized && hasCode('A11')) isMandatory = false;

    // Inclusion annotations
    if (isAparthotel && hasCode('A9')) isMandatory = true;
    if (isSpecialized && hasCode('A12')) isMandatory = true;

    return isMandatory === true;
}

function getStarCriteriaBuckets(star, accommodationType = selectedAccommodationType) {
    const starKey = getStrictStarKey(star);
    if (!starKey) {
        return { mandatory: [], optional: [], all: [], ids: new Set() };
    }
    ensureAccommodationTypeSelection();
    const types = getAccommodationTypes();
    const effectiveAccommodationType = Object.prototype.hasOwnProperty.call(types, accommodationType)
        ? accommodationType
        : selectedAccommodationType;

    const allCriteria = getAllClassificationCriteria()
        .slice()
        .sort((a, b) => compareCriterionIds(a.id, b.id));

    const mandatory = allCriteria.filter(criterion => {
        return isCriterionMandatoryForAccommodationType(criterion, starKey, effectiveAccommodationType);
    });
    const optional = allCriteria.filter(criterion => {
        return !isCriterionMandatoryForAccommodationType(criterion, starKey, effectiveAccommodationType);
    });
    const all = allCriteria;
    return {
        mandatory,
        optional,
        all,
        ids: new Set(all.map(criterion => String(criterion.id)))
    };
}

function getAssessableCriterionIdSet(star = selectedStar) {
    return getStarCriteriaBuckets(star).ids;
}

function getMandatoryCriteriaForStar(star) {
    return getStarCriteriaBuckets(star).mandatory;
}

function getOptionalCriteriaForStar(star) {
    return getStarCriteriaBuckets(star).optional;
}

function getMandatoryIdsForLevel(level) {
    if (!level) return [];
    return Array.from(new Set(getMandatoryCriteriaForStar(level.star).map(criterion => String(criterion.id))));
}

function getTotalClassificationCriteriaCount() {
    if (!CLASSIFICATION_DATA_3296 || !Array.isArray(CLASSIFICATION_DATA_3296.sections)) return 0;
    return CLASSIFICATION_DATA_3296.sections.reduce((sum, section) => {
        const count = (section.criteria || []).filter(isAssessableClassificationCriterion).length;
        return sum + count;
    }, 0);
}

function getMaxPointsForStar(star = selectedStar) {
    const configuredMaxPoints = Number(CLASSIFICATION_DATA_3296?.maxPoints);
    if (Number.isFinite(configuredMaxPoints) && configuredMaxPoints > 0) {
        return configuredMaxPoints;
    }
    return getStarCriteriaBuckets(star).all.reduce((sum, criterion) => {
        return sum + getCriterionMaxPoints(criterion);
    }, 0);
}

function getAllClassificationCriteria() {
    if (!CLASSIFICATION_DATA_3296 || !Array.isArray(CLASSIFICATION_DATA_3296.sections)) return [];
    const items = [];
    CLASSIFICATION_DATA_3296.sections.forEach(section => {
        section.criteria.forEach(criterion => {
            if (!isAssessableClassificationCriterion(criterion)) return;
            items.push({
                ...criterion,
                sectionId: String(section.id),
                sectionTitle: getSectionTitle(section)
            });
        });
    });
    return items;
}

function getCriterionById(id) {
    const target = String(id);
    for (const section of (CLASSIFICATION_DATA_3296.sections || [])) {
        const criterion = section.criteria.find(c => String(c.id) === target && isAssessableClassificationCriterion(c));
        if (criterion) {
            return {
                ...criterion,
                sectionId: String(section.id),
                sectionTitle: getSectionTitle(section)
            };
        }
    }
    return null;
}

function buildMandatoryStarMap() {
    const map = new Map();
    [1, 2, 3, 4, 5].forEach(star => {
        getMandatoryCriteriaForStar(star).forEach(criterion => {
            const key = String(criterion.id);
            if (!map.has(key)) map.set(key, new Set());
            map.get(key).add(star);
        });
    });
    return map;
}

function compareCriterionIds(a, b) {
    const ax = String(a).split('.').map(part => Number(part));
    const bx = String(b).split('.').map(part => Number(part));
    const len = Math.max(ax.length, bx.length);
    for (let i = 0; i < len; i++) {
        const av = Number.isFinite(ax[i]) ? ax[i] : -1;
        const bv = Number.isFinite(bx[i]) ? bx[i] : -1;
        if (av !== bv) return av - bv;
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function isFilterActive(id) {
    const element = document.getElementById(id);
    return Boolean(element && element.classList.contains('active'));
}

function getEvidenceCount() {
    return Object.values(evidenceData).reduce((sum, files) => sum + (Array.isArray(files) ? files.length : 0), 0);
}

function formatDateTime(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleString();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'success' || type === 'error') toast.classList.add(type);
    toast.classList.add('active');
    if (toastTimerId) clearTimeout(toastTimerId);
    toastTimerId = setTimeout(() => {
        toast.classList.remove('active');
    }, 2600);
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function isMasterUser() {
    return Boolean(currentUser && currentUser.role === 'master');
}

function applyMasterVisibility() {
    const isMaster = isMasterUser();
    document.querySelectorAll('[data-master-only]').forEach(element => {
        if (isMaster) {
            if (element.id === 'userManagementCard' || element.id === 'resolutionCard') {
                element.style.display = 'block';
            } else if (element.id === 'notificationBtn') {
                element.style.display = 'inline-flex';
            } else {
                element.style.display = '';
            }
        } else {
            element.style.display = 'none';
            element.classList.remove('active');
        }
    });
}

function setAssessmentField(field, value) {
    if (!Object.prototype.hasOwnProperty.call(assessmentData, field)) return;
    assessmentData[field] = value;
    persistWorkingState();
}

function getAssessmentData() {
    return { ...assessmentData };
}

function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAssessmentRecord() {
    const evaluation = evaluate3296();
    return {
        id: createId('assessment'),
        hotelName: assessmentData.hotelName || 'Hotel',
        star: selectedStar,
        accommodationType: selectedAccommodationType,
        complianceFacilityType: selectedComplianceFacilityType,
        assessmentData: { ...assessmentData },
        complianceAnswers: { ...complianceAnswers },
        classificationAnswers: { ...classificationAnswers },
        classificationQuantities: { ...classificationQuantities },
        evidenceData: JSON.parse(JSON.stringify(evidenceData)),
        summary: {
            points: evaluation.points || 0,
            achieved: Boolean(evaluation.achieved),
            achievedStar: evaluation.achieved ? evaluation.star : 0
        },
        createdAt: new Date().toISOString(),
        createdBy: currentUser ? currentUser.username : 'system'
    };
}

function saveAssessmentRecord(record) {
    if (!record || !record.id) return;
    assessments.unshift(record);
    assessments = assessments.slice(0, 200);
    setStoredArray(STORAGE_KEYS.assessments, assessments);
}

function saveReportRecord(record) {
    if (!record || !record.id) return;
    reports.unshift(record);
    reports = reports.slice(0, 200);
    setStoredArray(STORAGE_KEYS.reports, reports);
}

function loadAssessmentRecordById(id) {
    const record = assessments.find(item => item.id === id);
    if (!record) return;
    selectedStar = Number(record.star) || selectedStar;
    if (typeof record.accommodationType === 'string' && record.accommodationType.trim()) {
        selectedAccommodationType = record.accommodationType;
    }
    if (typeof record.complianceFacilityType === 'string' && record.complianceFacilityType.trim()) {
        selectedComplianceFacilityType = record.complianceFacilityType;
    }
    assessmentData = { ...assessmentData, ...(record.assessmentData || {}) };
    complianceAnswers = { ...(record.complianceAnswers || {}) };
    classificationAnswers = { ...(record.classificationAnswers || {}) };
    classificationQuantities = normalizeQuantityMap(record.classificationQuantities || {});
    evidenceData = { ...(record.evidenceData || {}) };
    populateAccommodationTypeOptions();
    populateComplianceFacilityTypeOptions();
    initStarCards();
    renderComplianceSections();
    renderClassificationCriteria();
    updateStats();
    renderCompareTable();
    showPage('classification');
    showToast(t('viewAction'), 'success');
}

function deleteAssessmentRecord(id) {
    assessments = assessments.filter(item => item.id !== id);
    setStoredArray(STORAGE_KEYS.assessments, assessments);
    renderManagementLists();
}

function openSavedReport(id) {
    const report = reports.find(item => item.id === id);
    if (!report) return;
    const win = window.open('', '_blank', 'width=1000,height=750');
    if (!win) {
        showToast(t('popupBlocked'), 'error');
        return;
    }
    win.document.write(buildReportWindowHtml(report.html || `<p>${t('reportPlaceholder')}</p>`));
    win.document.close();
}

function deleteReportRecord(id) {
    reports = reports.filter(item => item.id !== id);
    setStoredArray(STORAGE_KEYS.reports, reports);
    renderManagementLists();
}

function deleteUser(username) {
    if (!isMasterUser()) return;
    const users = getStoredUsers().filter(user => user.username !== username);
    setStoredUsers(users);
    renderManagementLists();
}

function makeActionButton(text, className, onClick) {
    const button = document.createElement('button');
    button.className = className;
    button.textContent = text;
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
}

function renderAssessmentsList() {
    const container = document.getElementById('assessmentsList');
    if (!container) return;
    container.innerHTML = '';
    if (!assessments.length) {
        container.innerHTML = `<p style="text-align:center;color:var(--gray-500);padding:20px">${t('noAssessments')}</p>`;
        return;
    }

    assessments
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(record => {
            const row = document.createElement('div');
            row.className = 'list-row';

            const info = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'title';
            title.textContent = record.hotelName || record.assessmentData?.hotelName || 'Hotel';
            const meta = document.createElement('div');
            meta.className = 'meta';
            const points = record.summary?.points ?? 0;
            meta.textContent = `${formatDateTime(record.createdAt)} • ${points} ${t('pointsLabel')}`;
            info.appendChild(title);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'list-actions';
            actions.appendChild(makeActionButton(t('viewAction'), 'btn btn-secondary btn-sm', () => loadAssessmentRecordById(record.id)));
            if (isMasterUser()) {
                actions.appendChild(makeActionButton(t('deleteAction'), 'btn btn-danger btn-sm', () => deleteAssessmentRecord(record.id)));
            }

            row.appendChild(info);
            row.appendChild(actions);
            container.appendChild(row);
        });
}

function renderReportsList() {
    const container = document.getElementById('reportsList');
    if (!container) return;
    container.innerHTML = '';
    if (!reports.length) {
        container.innerHTML = `<p style="text-align:center;color:var(--gray-500);padding:20px">${t('noReports')}</p>`;
        return;
    }

    reports
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(report => {
            const row = document.createElement('div');
            row.className = 'list-row';

            const info = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'title';
            title.textContent = report.hotelName || 'Hotel Report';
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = `${formatDateTime(report.createdAt)} • ${report.createdBy || 'system'}`;
            info.appendChild(title);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'list-actions';
            actions.appendChild(makeActionButton(t('viewAction'), 'btn btn-secondary btn-sm', () => openSavedReport(report.id)));
            if (isMasterUser()) {
                actions.appendChild(makeActionButton(t('deleteAction'), 'btn btn-danger btn-sm', () => deleteReportRecord(report.id)));
            }

            row.appendChild(info);
            row.appendChild(actions);
            container.appendChild(row);
        });
}

function renderUsersTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const users = getStoredUsers();
    if (!users.length) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5" style="text-align:center;color:var(--gray-500)">${t('noUsers')}</td>`;
        tbody.appendChild(row);
        return;
    }

    users.forEach(user => {
        const row = document.createElement('tr');
        const actionCell = document.createElement('td');
        if (isMasterUser()) {
            actionCell.appendChild(makeActionButton(t('deleteAction'), 'btn btn-danger btn-sm', () => deleteUser(user.username)));
        } else {
            actionCell.textContent = '—';
        }
        row.innerHTML = `
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.fullName)}</td>
            <td><span class="role-badge">${t('roleInspector')}</span></td>
            <td>${t('statusActive')}</td>
        `;
        row.appendChild(actionCell);
        tbody.appendChild(row);
    });
}

function renderManagementLists() {
    renderAssessmentsList();
    renderReportsList();
    renderUsersTable();
}

function updateNotifications() {
    const list = document.getElementById('notificationList');
    const countEl = document.getElementById('notificationCount');
    if (!list || !countEl) return;

    const unreadCount = notifications.filter(item => !item.read).length;
    countEl.textContent = String(unreadCount);
    countEl.classList.toggle('show', unreadCount > 0);

    list.innerHTML = '';
    if (!notifications.length) {
        list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--gray-400);font-size:13px">${t('notificationEmpty')}</div>`;
        persistWorkingState();
        return;
    }

    notifications
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(item => {
            const node = document.createElement('div');
            node.className = `notification-item ${item.read ? '' : 'unread'}`.trim();
            node.innerHTML = `
                <div class="title">${escapeHtml(item.title)}</div>
                <div class="message">${escapeHtml(item.message)}</div>
                <div class="time">${formatDateTime(item.createdAt)}</div>
            `;
            node.addEventListener('click', () => {
                item.read = true;
                updateNotifications();
            });
            list.appendChild(node);
        });
    persistWorkingState();
}

function addNotification(title, message) {
    notifications.unshift({
        id: createId('notification'),
        title,
        message,
        read: false,
        createdAt: new Date().toISOString()
    });
    notifications = notifications.slice(0, 150);
    updateNotifications();
}

function renderResolutions() {
    const container = document.getElementById('resolutionList');
    if (!container) return;
    container.innerHTML = '';
    if (!resolutions.length) {
        container.innerHTML = `<p style="text-align:center;color:var(--gray-500);padding:30px">${t('resolutionEmpty')}</p>`;
        persistWorkingState();
        return;
    }

    resolutions
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(item => {
            const criterion = getCriterionById(item.criterionId);
            const title = criterion ? (criterion.title[currentLang] || criterion.title.en || criterion.id) : item.criterionId;
            const card = document.createElement('div');
            card.className = `resolution-item ${item.status === 'submitted' ? 'submitted' : 'pending'}`;

            const evidenceList = Array.isArray(item.evidence) && item.evidence.length
                ? `<div style="font-size:11px;color:var(--gray-600);margin-top:8px">${item.evidence.map(file => escapeHtml(file.name)).join(', ')}</div>`
                : '';

            card.innerHTML = `
                <div class="resolution-status ${item.status === 'submitted' ? 'submitted' : 'pending'}">
                    ${item.status === 'submitted' ? t('resolutionStatusSubmitted') : t('resolutionStatusPending')}
                </div>
                <div style="font-weight:700;color:var(--gray-800);margin-bottom:6px">#${escapeHtml(item.criterionId)} - ${escapeHtml(title)}</div>
                <div style="font-size:12px;color:var(--gray-500)">
                    ${(item.star || selectedStar)}★ • ${formatDateTime(item.createdAt)}
                </div>
                ${evidenceList}
            `;

            const actions = document.createElement('div');
            actions.className = 'list-actions';
            actions.style.marginTop = '10px';

            if (item.status !== 'submitted') {
                actions.appendChild(makeActionButton(`📷 ${t('photoLabel')}`, 'btn btn-secondary btn-sm', () => uploadResolutionEvidence(item.id, 'photo')));
                actions.appendChild(makeActionButton(`🎥 ${t('videoLabel')}`, 'btn btn-secondary btn-sm', () => uploadResolutionEvidence(item.id, 'video')));
                actions.appendChild(makeActionButton(`📄 ${t('documentLabel')}`, 'btn btn-secondary btn-sm', () => uploadResolutionEvidence(item.id, 'document')));
                actions.appendChild(makeActionButton(t('resolutionSubmit'), 'btn btn-success btn-sm', () => submitResolution(item.id)));
            }

            card.appendChild(actions);
            container.appendChild(card);
        });
    persistWorkingState();
}

function uploadResolutionEvidence(resolutionId, type) {
    currentUpload = { mode: 'resolution', id: resolutionId, type };
    const input = document.getElementById(type + 'Input');
    if (input) input.click();
}

function submitResolution(resolutionId) {
    const item = resolutions.find(entry => entry.id === resolutionId);
    if (!item) return;
    item.status = 'submitted';
    item.submittedAt = new Date().toISOString();
    renderResolutions();
    addNotification(t('resolutionSubmittedTitle'), `#${item.criterionId}`);
    showToast(t('resolutionSubmittedTitle'), 'success');
}

function sendToResolution() {
    if (!isMasterUser()) return;
    const currentStarLevel = getStarLevel(selectedStar);
    if (!currentStarLevel) return;

    const missingIds = getMandatoryIdsForLevel(currentStarLevel).filter(id => {
        return !isMandatoryCriterionIdSatisfied(id);
    });

    if (!missingIds.length) {
        showToast(t('reportAllMandatoryMet'), 'success');
        return;
    }

    let added = 0;
    missingIds.forEach(id => {
        const exists = resolutions.some(item =>
            String(item.criterionId) === String(id) &&
            Number(item.star) === Number(selectedStar) &&
            item.status !== 'closed'
        );
        if (exists) return;
        resolutions.push({
            id: createId('resolution'),
            criterionId: String(id),
            star: selectedStar,
            status: 'pending',
            evidence: [],
            createdAt: new Date().toISOString()
        });
        added++;
    });

    renderResolutions();
    if (added > 0) {
        const message = t('resolutionRequiredMessage').replace('{count}', added);
        addNotification(t('resolutionRequiredTitle'), message);
        showToast(message, 'success');
    }
}

function resetClassification() {
    if (!window.confirm(t('resetConfirm'))) return;
    classificationAnswers = {};
    classificationQuantities = {};
    evidenceData = {};
    renderClassificationCriteria();
    updateStats();
    showToast(t('resetAssessment'), 'success');
}

function renderCompareTable() {
    const container = document.getElementById('compareTable');
    if (!container) return;
    const categoryFilter = document.getElementById('compareCategoryFilter')?.value || '';
    const mandatoryMap = buildMandatoryStarMap();
    const sections = (CLASSIFICATION_DATA_3296.sections || []).filter(section => {
        return !categoryFilter || String(section.id) === String(categoryFilter);
    });

    let rowsHtml = '';
    sections.forEach(section => {
        const sectionRows = section.criteria
            .filter(isAssessableClassificationCriterion)
            .sort((a, b) => compareCriterionIds(a.id, b.id));
        if (!sectionRows.length) return;

        rowsHtml += `
            <tr class="category-row">
                <td colspan="6">${escapeHtml(getSectionTitle(section))}</td>
            </tr>
        `;
        sectionRows.forEach(criterion => {
            const stars = mandatoryMap.get(String(criterion.id)) || new Set();
            const title = criterion.title[currentLang] || criterion.title.en || '';
            rowsHtml += `
                <tr>
                    <td>#${escapeHtml(criterion.id)} - ${escapeHtml(title)}</td>
                    ${[1, 2, 3, 4, 5].map(star => stars.has(star)
                        ? '<td style="text-align:center"><span class="compare-mark">✓</span></td>'
                        : '<td style="text-align:center"><span class="compare-dash">—</span></td>').join('')}
                </tr>
            `;
        });
    });

    if (!rowsHtml) {
        container.innerHTML = `<p style="color:var(--gray-500);font-size:12px">${t('noItems')}</p>`;
        return;
    }

    container.innerHTML = `
        <table class="compare-table">
            <thead>
                <tr>
                    <th>${t('criterionLabel')}</th>
                    <th>1★</th>
                    <th>2★</th>
                    <th>3★</th>
                    <th>4★</th>
                    <th>5★</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

function calculateTotalYesPoints(star = selectedStar) {
    const activeCriteriaIds = getAssessableCriterionIdSet(star);
    let points = 0;
    (CLASSIFICATION_DATA_3296.sections || []).forEach(section => {
        section.criteria.forEach(criterion => {
            if (!isAssessableClassificationCriterion(criterion)) return;
            if (!activeCriteriaIds.has(String(criterion.id))) return;
            points += getCriterionEarnedPoints(criterion);
        });
    });
    return points;
}

function isStarAchievable(star) {
    const starLevel = getStarLevel(star);
    if (!starLevel) return false;
    const totalPoints = calculateTotalYesPoints(star);
    const mandatoryOk = getMandatoryIdsForLevel(starLevel).every(id => {
        return isMandatoryCriterionIdSatisfied(id);
    });
    return mandatoryOk && totalPoints >= getMinPointsForStar(star);
}

function getEligibleStar() {
    for (let star = 5; star >= 1; star--) {
        if (isStarAchievable(star)) return star;
    }
    return 0;
}

function updateAssessmentPanel() {
    const points = calculateTotalYesPoints(selectedStar);
    const assessableIds = getAssessableCriterionIdSet();
    const assessedCount = Object.entries(classificationAnswers)
        .filter(([id, status]) => Boolean(status) && assessableIds.has(String(id)))
        .length;
    const mandatoryFiveStar = getStarLevel(5) || { mandatoryIds: [] };
    const mandatoryIds = getMandatoryIdsForLevel(mandatoryFiveStar);
    const fulfilledMandatory = mandatoryIds.filter(id => {
        return isMandatoryCriterionIdSatisfied(id);
    }).length;
    const mandatoryPct = mandatoryIds.length
        ? Math.round((fulfilledMandatory / mandatoryIds.length) * 100)
        : 0;
    const eligibleStar = getEligibleStar();
    const starsString = eligibleStar > 0
        ? `${'★'.repeat(eligibleStar)}${'☆'.repeat(5 - eligibleStar)}`
        : '☆☆☆☆☆';

    const assessPoints = document.getElementById('assessPoints');
    const assessCount = document.getElementById('assessCount');
    const assessMandatoryPct = document.getElementById('assessMandatoryPct');
    const assessEligible = document.getElementById('assessEligible');

    if (assessPoints) assessPoints.textContent = String(points);
    if (assessCount) assessCount.textContent = String(assessedCount);
    if (assessMandatoryPct) assessMandatoryPct.textContent = `${mandatoryPct}%`;
    if (assessEligible) assessEligible.textContent = starsString;
}

function updateDashboardStats() {
    const totalCriteria = getTotalClassificationCriteriaCount();
    const categories = (CLASSIFICATION_DATA_3296.sections || []).length;
    const maxPoints = getMaxPointsForStar(selectedStar);
    const mandatory5 = getMandatoryIdsForLevel(getStarLevel(5)).length;

    const statTotalCriteria = document.getElementById('statTotalCriteria');
    const statCategories = document.getElementById('statCategories');
    const statMaxPoints = document.getElementById('statMaxPoints');
    const statMandatory5 = document.getElementById('statMandatory5');

    if (statTotalCriteria) statTotalCriteria.textContent = String(totalCriteria);
    if (statCategories) statCategories.textContent = String(categories);
    if (statMaxPoints) statMaxPoints.textContent = String(maxPoints);
    if (statMandatory5) statMandatory5.textContent = String(mandatory5);
}

function buildStarListingHtml(starLevel, type) {
    const criteria = (type === 'mandatory'
        ? getMandatoryCriteriaForStar(starLevel.star)
        : getOptionalCriteriaForStar(starLevel.star))
        .slice()
        .sort((a, b) => compareCriterionIds(a.id, b.id));

    return `<!DOCTYPE html>
<html lang="${currentLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${starLevel.star}★ ${type}</title>
<style>
    body { font-family: "Segoe UI", Tahoma, sans-serif; margin: 0; background: #f8fafc; color: #111827; }
    .wrap { max-width: 980px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { color: #64748b; margin-bottom: 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: .04em; }
    .id { font-weight: 700; color: #334155; white-space: nowrap; }
    .sec { color: #64748b; font-size: 11px; margin-top: 3px; }
</style>
</head>
<body>
    <div class="wrap">
        <h1>${starLevel.label} ${t('starLabel')} - ${type === 'mandatory' ? t('mandatory') : t('optional')}</h1>
        <p>${t('criterionLabel')}: ${criteria.length}</p>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>${t('criterionLabel')}</th>
                    <th>${t('pointsLabel')}</th>
                </tr>
            </thead>
            <tbody>
                ${criteria.map(criterion => {
                    const title = criterion.title[currentLang] || criterion.title.en || '';
                    const pointsText = isPerUnitCriterion(criterion)
                        ? `${criterion.scoringRule.pointsPerUnit}×${t('unitLabel')} (max ${getCriterionMaxPoints(criterion)})`
                        : String(criterion.points);
                    return `
                        <tr>
                            <td class="id">#${escapeHtml(criterion.id)}</td>
                            <td>
                                <div>${escapeHtml(title)}</div>
                                <div class="sec">${escapeHtml(criterion.sectionTitle)}</div>
                            </td>
                            <td>${escapeHtml(pointsText)}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>`;
}

function openHtmlWindow(title, bodyHtml) {
    const win = window.open('', '_blank', 'width=1000,height=760');
    if (!win) {
        showToast(t('popupBlocked'), 'error');
        return;
    }
    win.document.write(`<!DOCTYPE html>
<html lang="${currentLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
    body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; background: #f8fafc; color: #111827; }
    .container { max-width: 1000px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 22px; margin-bottom: 12px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 14px; }
    .item { padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .item:last-child { border-bottom: none; }
</style>
</head>
<body>
    <div class="container">
        <h1>${escapeHtml(title)}</h1>
        ${bodyHtml}
    </div>
</body>
</html>`);
    win.document.close();
}

function showGapReport() {
    let body = '';

    [1, 2, 3, 4, 5].forEach(star => {
        const level = getStarLevel(star);
        if (!level) return;
        const totalPoints = calculateTotalYesPoints(star);
        const maxPoints = getMaxPointsForStar(star);
        const failedMandatory = getMandatoryIdsForLevel(level).filter(id => {
            return !isMandatoryCriterionIdSatisfied(id);
        });
        const minPoints = getMinPointsForStar(star);
        const pointsGap = Math.max(0, minPoints - totalPoints);
        body += `
            <div class="card">
                <h3>${'★'.repeat(star)} (${star}★)</h3>
                <div class="item">${t('reportRequired')} <strong>${minPoints}</strong> ${t('pointsLabel')}</div>
                <div class="item">${t('reportTotalPoints')} <strong>${totalPoints}</strong> / <strong>${maxPoints}</strong></div>
                <div class="item">${t('reportShortfall')} <strong>${pointsGap}</strong></div>
                <div class="item">${t('mandatory')}: <strong>${failedMandatory.length}</strong> missing</div>
            </div>
        `;
    });

    openHtmlWindow(t('gapReportTitle'), body);
}

function showMandatoryChecklist() {
    const level = getStarLevel(selectedStar);
    if (!level) return;
    const items = getMandatoryIdsForLevel(level)
        .map(id => getCriterionById(id))
        .filter(Boolean)
        .sort((a, b) => compareCriterionIds(a.id, b.id));

    const body = `
        <div class="card">
            ${items.map(item => {
                const mark = isMandatoryCriterionIdSatisfied(item.id) ? '✅' : '❌';
                const title = item.title[currentLang] || item.title.en || item.id;
                return `<div class="item">${mark} #${escapeHtml(item.id)} - ${escapeHtml(title)}</div>`;
            }).join('')}
        </div>
    `;

    openHtmlWindow(`${t('mandatoryReportTitle')} (${selectedStar}★)`, body);
}

function exportAssessmentData() {
    const payload = {
        exportedAt: new Date().toISOString(),
        user: currentUser ? currentUser.username : 'unknown',
        selectedStar,
        selectedAccommodationType,
        selectedComplianceFacilityType,
        assessmentData,
        complianceAnswers,
        classificationAnswers,
        classificationQuantities,
        evidenceData,
        summary: {
            compliance: evaluate3220(),
            classification: evaluate3296()
        }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('exportFileName')}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(t('reportCardExportTitle'), 'success');
}

function applyLanguage() {
    const textMap = {
        loginTitle: 'loginTitle',
        loginSubtitle: 'loginSubtitle',
        loginUsernameLabel: 'usernameLabel',
        loginPasswordLabel: 'passwordLabel',
        loginButton: 'loginButton',
        loginHint: 'loginHint',
        headerTitle: 'headerTitle',
        navDashboard: 'navDashboard',
        navAssessment: 'navAssessment',
        navCompare: 'navCompare',
        navReports: 'navReports',
        logoutBtn: 'logout',
        dashboardTitle: 'dashboardTitle',
        accommodationTypeLabel: 'accommodationTypeLabel',
        compareTitle: 'compareTitle',
        compareSubtitle: 'compareSubtitle',
        complianceTitle: 'complianceTitle',
        complianceFacilityTypeLabel: 'complianceFacilityTypeLabel',
        classificationTitle: 'classificationTitle',
        complete3220Btn: 'complete3220',
        complete3296Btn: 'complete3296',
        generateReportBtn: 'generateReport',
        assessmentPanelTitle: 'assessmentPanelTitle',
        assessmentPanelSubtitle: 'assessmentPanelSubtitle',
        assessPointsLabel: 'assessPointsLabel',
        assessCountLabel: 'assessCountLabel',
        assessMandatoryLabel: 'assessMandatoryLabel',
        assessEligibleLabel: 'assessEligibleLabel',
        openHotelInfoBtn: 'openHotelInfo',
        openComplianceBtn: 'openCompliance',
        resetAssessmentBtn: 'resetAssessment',
        openFullReportBtn: 'generateReport',
        reportToolsTitle: 'reportToolsTitle',
        reportToolsSubtitle: 'reportToolsSubtitle',
        reportCardFullTitle: 'reportCardFullTitle',
        reportCardFullDesc: 'reportCardFullDesc',
        reportCardGapTitle: 'reportCardGapTitle',
        reportCardGapDesc: 'reportCardGapDesc',
        reportCardMandatoryTitle: 'reportCardMandatoryTitle',
        reportCardMandatoryDesc: 'reportCardMandatoryDesc',
        reportCardExportTitle: 'reportCardExportTitle',
        reportCardExportDesc: 'reportCardExportDesc',
        assessmentsTitle: 'assessmentsTitle',
        reportsTitle: 'reportsTitle',
        usersTitle: 'usersTitle',
        reportPlaceholder: 'reportPlaceholder',
        progressTitle: 'progressTitle',
        assessedLabel: 'assessedLabel',
        pointsLabel: 'pointsLabel',
        fulfilledLabel: 'fulfilledLabel',
        fulfilledSub: 'fulfilledSub',
        missingLabel: 'missingLabel',
        missingSub: 'missingSub',
        mandatoryLabel: 'mandatoryLabel',
        mandatorySub: 'mandatorySub',
        evidenceLabel: 'evidenceLabel',
        evidenceSub: 'evidenceSub',
        statTotalLabel: 'statTotalLabel',
        statCategoriesLabel: 'statCategoriesLabel',
        statMaxPointsLabel: 'statMaxPointsLabel',
        statMandatoryLabel: 'statMandatoryLabel',
        filterMandatoryBtn: 'filterMandatory',
        filterMissingBtn: 'filterMissing',
        classificationHideCheckedLabel: 'classificationHideCheckedLabel',
        notificationTitle: 'notificationTitle',
        clearNotificationsBtn: 'notificationClear',
        resolutionTitle: 'resolutionTitle',
        resolutionHeaderTitle: 'resolutionHeaderTitle',
        resolutionHeaderSubtitle: 'resolutionHeaderSubtitle',
        resolutionEmpty: 'resolutionEmpty',
        adminUsersTitle: 'adminUsersTitle',
        openAddUserBtn: 'addUserOpen',
        userTableUsername: 'userTableUsername',
        userTableName: 'userTableName',
        userTableRole: 'userTableRole',
        userTableStatus: 'userTableStatus',
        userTableActions: 'userTableActions',
        addUserTitle: 'addUserTitle',
        addUserSubtitle: 'addUserSubtitle',
        newFullNameLabel: 'fullNameLabel',
        newUsernameLabel: 'newUsernameLabel',
        newPasswordLabel: 'newPasswordLabel',
        addUserCancelBtn: 'addUserCancel',
        addUserSubmitBtn: 'addUserSubmit',
        starModalMandatoryBtn: 'mandatory',
        starModalOptionalBtn: 'optional',
        starModalCloseBtn: 'closeAction'
    };

    Object.entries(textMap).forEach(([id, key]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = t(key);
    });

    const placeholders = [
        ['username', 'usernamePlaceholder'],
        ['password', 'passwordPlaceholder'],
        ['classificationSearch', 'classificationSearchPlaceholder'],
        ['newFullName', 'fullNamePlaceholder'],
        ['newUsername', 'newUsernamePlaceholder'],
        ['newPassword', 'newPasswordPlaceholder']
    ];
    placeholders.forEach(([id, key]) => {
        const input = document.getElementById(id);
        if (input) input.placeholder = t(key);
    });

    document.documentElement.lang = currentLang;
    document.querySelectorAll('.lang-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.lang === currentLang);
    });

    if (currentUser) {
        const roleNode = document.getElementById('displayUserRole');
        if (roleNode) {
            roleNode.textContent = isMasterUser() ? t('roleMaster') : t('roleInspector');
        }
    }

    populateFilters();
    populateAccommodationTypeOptions();
    populateComplianceFacilityTypeOptions();
    initStarCards();
    renderComplianceSections();
    renderClassificationCriteria();
    renderCompareTable();
    renderManagementLists();
    updateNotifications();
    renderResolutions();
    updateStats();
}

// =====================================================
// EXPORTS
// =====================================================

window.app = {
    loadData,
    t,
    showPage,
    openAssessmentWindow,
    generateReport,
    exportAssessmentData,
    sendToResolution,
    addNotification,
    closeModal,
    openModal,
    resetClassification,
    showGapReport,
    showMandatoryChecklist
};
