let currentMinQuantity = 0;

ymaps.ready(init);

function init() {
    fetch('open.json')
        .then(response => response.json())
        .then(obj => {
            console.log('raw data:', obj);

            const searchControls = new ymaps.control.SearchControl({
                options: {
                    float: 'right',
                    noPlacemark: true
                }
            });

            // Карта
            const myMap = new ymaps.Map('map', {
                center: [55.76, 37.64],
                zoom: 7,
                controls: [searchControls]
            });

            // Убираем лишние контролы
            const removeControls = [
                'geolocationControl',
                'trafficControl',
                'fullscreenControl',
                'zoomControl',
                'rulerControl',
                'typeSelector'
            ];
            removeControls.forEach(ctrl => myMap.controls.remove(ctrl));

            // ObjectManager
            const objectManager = new ymaps.ObjectManager({
                clusterize: true,
                clusterIconLayout: 'default#pieChart'
            });

            // Границы карты
            let minLatitude = Infinity, maxLatitude = -Infinity;
            let minLongitude = Infinity, maxLongitude = -Infinity;

            // Диапазон по quantity
            let minQuantity = Infinity;
            let maxQuantity = -Infinity;

            const validFeatures = [];

            obj.features.forEach(feature => {
                // --- координаты ---
                if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
                    return; // битая геометрия
                }

                const [longitude, latitude] = feature.geometry.coordinates;
                const lat = Number(latitude);
                const lon = Number(longitude);

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    return; // плохие координаты
                }

                // Яндекс ждёт [lat, lon]
                feature.geometry.coordinates = [lat, lon];

                minLatitude = Math.min(minLatitude, lat);
                maxLatitude = Math.max(maxLatitude, lat);
                minLongitude = Math.min(minLongitude, lon);
                maxLongitude = Math.max(maxLongitude, lon);

                // --- quantity ---
                const q = extractQuantity(feature);
                // если у точки нет кол-ва ДК — пропускаем
                if (q === null) {
                    return;
                }

                if (!feature.properties) feature.properties = {};
                feature.properties.quantity = q;

                if (q < minQuantity) minQuantity = q;
                if (q > maxQuantity) maxQuantity = q;

                validFeatures.push(feature);
            });

            if (validFeatures.length === 0) {
                console.warn('Нет точек с корректным quantity.');
                return;
            }

            // если по какой-то причине min/max не нашли
            if (minQuantity === Infinity || maxQuantity === -Infinity) {
                minQuantity = 0;
                maxQuantity = 0;
            }

            console.log('quantity min =', minQuantity, 'max =', maxQuantity);

            // подменяем features на отфильтрованные
            obj.features = validFeatures;

            // добавляем на карту
            objectManager.removeAll();
            objectManager.add(obj);
            myMap.geoObjects.add(objectManager);

            // границы карты
            if (minLatitude !== Infinity && maxLatitude !== -Infinity &&
                minLongitude !== Infinity && maxLongitude !== -Infinity) {
                const bounds = [
                    [minLatitude, minLongitude],
                    [maxLatitude, maxLongitude]
                ];
                myMap.setBounds(bounds, { checkZoomRange: true });
            }

            // фильтр по количеству
            setupFilterUI(minQuantity, maxQuantity, objectManager);
        })
        .catch(err => {
            console.error('Ошибка загрузки open.json:', err);
        });
}

/**
 * Получаем количество ДК для точки:
 * 1) если есть properties.quantity — используем его;
 * 2) иначе парсим число из balloonContentBody.
 * Если ничего не нашли — возвращаем null.
 */
function extractQuantity(feature) {
    if (!feature.properties) return null;

    // 1. quantity как отдельное поле
    if (feature.properties.quantity !== undefined && feature.properties.quantity !== null && feature.properties.quantity !== '') {
        const qNum = Number(feature.properties.quantity);
        if (Number.isFinite(qNum)) return qNum;
    }

    // 2. Пытаемся достать из HTML balloonContentBody
    const body = feature.properties.balloonContentBody;
    if (typeof body === 'string') {
        // Ищем "Кол-во ДК за месяц: <span ...>ЧИСЛО"
        const re = /Кол-во\s+ДК\s+за\s+месяц:\s*<span[^>]*>([\d\s]+)/i;
        const match = body.match(re);
        if (match && match[1]) {
            const numStr = match[1].replace(/\s+/g, '');
            const q = parseInt(numStr, 10);
            if (!isNaN(q)) {
                return q;
            }
        }
    }

    // Ничего не нашли
    return null;
}

function setupFilterUI(minQuantity, maxQuantity, objectManager) {
    const toggleBtn = document.getElementById('filter-toggle');
    const panel = document.getElementById('filter-panel');
    const range = document.getElementById('quantity-range');
    const input = document.getElementById('quantity-input');
    const currentValueLabel = document.getElementById('filter-current-value');

    if (!toggleBtn || !panel || !range || !input || !currentValueLabel) {
        console.warn('Элементы фильтра не найдены в DOM.');
        return;
    }

    // панель изначально скрыта
    panel.style.display = 'none';

    // если все значения одинаковые — чуть расширим диапазон,
    // чтобы ползунок был живой
    if (minQuantity === maxQuantity) {
        range.min = minQuantity;
        range.max = maxQuantity + 1;
    } else {
        range.min = minQuantity;
        range.max = maxQuantity;
    }

    range.step = 1;
    range.value = minQuantity;

    input.min = minQuantity;
    input.max = maxQuantity;
    input.step = 1;
    input.value = minQuantity;

    updateCurrentValueLabel(minQuantity);

    // показать/скрыть панель
    toggleBtn.addEventListener('click', () => {
        const visibleNow = panel.style.display === 'block';
        panel.style.display = visibleNow ? 'none' : 'block';
        console.log('toggle filter panel, now:', panel.style.display);
    });

    // движение ползунка
    range.addEventListener('input', () => {
        const val = parseInt(range.value, 10);
        input.value = val;
        applyFilter(val, objectManager);
        updateCurrentValueLabel(val);
    });

    // ввод числа
    input.addEventListener('input', () => {
        let val = parseInt(input.value, 10);
        if (isNaN(val)) val = minQuantity;

        if (val < minQuantity) val = minQuantity;
        if (val > maxQuantity) val = maxQuantity;

        input.value = val;
        range.value = val;
        applyFilter(val, objectManager);
        updateCurrentValueLabel(val);
    });

    function updateCurrentValueLabel(minVal) {
        currentValueLabel.textContent = `Показываются точки с кол-вом ≥ ${minVal}`;
    }
}

function applyFilter(minQuantity, objectManager) {
    currentMinQuantity = minQuantity;

    if (!objectManager) return;

    objectManager.setFilter(obj => {
        const q = extractQuantity(obj);
        // если количества нет — скрываем точку
        if (q === null) return false;
        return q >= currentMinQuantity;
    });
}
