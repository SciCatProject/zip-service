
TAG    			:= $$(git describe --always)
REGISTRY		:= registry.nersc.gov
PROJECT 		:= als
REGISTRY_NAME	:= ${REGISTRY}/${PROJECT}/${IMG}

NAME_ZIP  	:= zip
IMG_ZIP  		:= ${NAME_ZIP}:${TAG}
REGISTRY_ZIP	:= ${REGISTRY}/${PROJECT}/${NAME_ZIP}:${TAG}



.PHONY: build

hello:
	@echo "Hello" ${REGISTRY}

build_zip:
	@echo "tagging to: " ${IMG_ZIP}    ${REGISTRY_ZIP}
	@docker build -t ${IMG_ZIP} -f Dockerfile ../../
	@docker tag ${IMG_ZIP} ${REGISTRY_ZIP}
 
push_zip:
	@echo "Pushing " ${REGISTRY_ZIP}
	@docker push ${REGISTRY_ZIP}


login:
	@docker log -u ${DOCKER_USER} -p ${DOCKER_PASS}