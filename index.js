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

            const filteredFeatures = [];

            obj.features.forEach(feature => {
                // --- координаты ---
                if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
                    return; // пропускаем битую геометрию
                }

                const [longitude, latitude] = feature.geometry.coordinates;
                const lat = Number(latitude);
                const lon = Number(longitude);

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    return; // плохие координаты — пропускаем
                }

                // меняем местами для Яндекс.Карт
                feature.geometry.coordinates = [lat, lon];

                minLatitude = Math.min(minLatitude, lat);
                maxLatitude = Math.max(maxLatitude, lat);
                minLongitude = Math.min(minLongitude, lon);
                maxLongitude = Math.max(maxLongitude, lon);

                // --- quantity ---
                const rawQ = feature.properties ? feature.properties.quantity : undefined;
                let q = Number(rawQ);

                if (!Number.isFinite(q)) {
                    // если у точки нет кол-ва ДК — полностью пропускаем её
                    return;
                }

                // сохраняем нормальное число обратно
                if (!feature.properties) feature.properties = {};
                feature.properties.quantity = q;

                if (q < minQuantity) minQuantity = q;
                if (q > maxQuantity) maxQuantity = q;

                filteredFeatures.push(feature);
            });

            // если после фильтрации ничего не осталось
            if (filteredFeatures.length === 0) {
                console.warn('Нет точек с корректным quantity.');
                return;
            }

            // если по какой-то причине min/max не обновились
            if (minQuantity === Infinity || maxQuantity === -Infinity) {
                minQuantity = 0;
                maxQuantity = 0;
            }

            console.log('quantity min =', minQuantity, 'max =', maxQuantity);

            // подменяем features на отфильтрованный список
            obj.features = filteredFeatures;

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

            // UI фильтра
            setupFilterUI(minQuantity, maxQuantity, objectManager);
        })
        .catch(err => {
            console.error('Ошибка загрузки open.json:', err);
        });
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

    // если все значения одинаковые — немного расширим диапазон
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
        const q = Number(obj.properties ? obj.properties.quantity : NaN);
        if (!Number.isFinite(q)) {
            // на всякий случай ещё раз отсеиваем точки без количества
            return false;
        }
        return q >= currentMinQuantity;
    });
}
